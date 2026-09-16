"""Verify shared international declarations without sharing account authority or domestic catalogs."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import converter as gateway
from app.control_store import ControlStore
from app.model_catalog_view import SharedModel, share_models
from app import model_capabilities as caps
import test_api_flow as fixtures
from test_model_capabilities import image_payload, model


class CatalogViewTests(unittest.TestCase):
    def test_only_missing_international_ids_are_shared_without_mutation(self):
        native = [model(supportsImages=False, credits="x1.00")]
        sources = [("intl-work", [model(), model(id="extra", maxOutputTokens=1024)])]
        before = deepcopy((native, sources))
        merged = share_models(native, "intl-cli", sources)
        self.assertIs(merged[0], native[0])
        self.assertIsInstance(merged[1], SharedModel)
        self.assertEqual([item["id"] for item in merged], ["shared-model", "extra"])
        self.assertEqual(merged[0]["credits"], "x1.00")
        self.assertEqual((native, sources), before)
        for domestic in ("cn-cli", "cn-work"):
            self.assertIs(share_models(native, domestic, sources), native)
        self.assertIsNone(share_models(None, "intl-cli", sources))
        self.assertEqual(len(share_models([], "intl-cli", sources)), 2)

    def test_source_conflicts_are_conservative_and_original_variants_remain_safe(self):
        yes = model(maxOutputTokens=4096, credits="x0.00", supportsImages=True,
                    reasoning={"supportedEfforts": ["low", "high"], "canDisableThinking": True})
        no = model(maxOutputTokens=2048, credits="x0.30", supportsImages=False,
                   reasoning={"supportedEfforts": ["high"], "canDisableThinking": False})
        no.update(accessToken="private-secret", uid="private-account")
        result = share_models([], "intl-cli", [("intl-work", [yes, no])])[0]
        self.assertEqual(result["credits"], "x0.30")
        self.assertEqual(result["maxOutputTokens"], 2048)
        self.assertFalse(result["supportsImages"])
        self.assertEqual(result["reasoning"]["supportedEfforts"], ["high"])
        safe = caps.describe_models([("intl-cli", result)])
        text = json.dumps(safe)
        self.assertNotIn("private-secret", text)
        self.assertNotIn("private-account", text)
        declaration = safe["metadata_by_profile"]["intl-cli"][0]
        self.assertEqual(declaration["catalog_source"], {"kind": "shared", "profiles": ["intl-work"]})
        self.assertEqual(len(declaration["source_variants"]), 2)

    def test_unknown_prices_and_limits_are_not_synthesized_as_free_or_unbounded(self):
        unknown = model(credits=None)
        known = model(maxOutputTokens=256, credits="x0.00")
        result = share_models([], "intl-cli", [("intl-work", [unknown, known])])[0]
        self.assertNotIn("credits", result)
        self.assertNotIn("maxOutputTokens", result)
        self.assertFalse(gateway._model_free([result], "shared-model", "intl-cli"))

    def test_disjoint_reasoning_options_do_not_become_unrestricted(self):
        variants = [model(reasoning={"supportedEfforts": [effort]}) for effort in ("low", "high")]
        result = share_models([], "intl-cli", [("intl-work", variants)])[0]
        self.assertEqual(result["reasoning"]["supportedEfforts"], [])
        for effort in ("low", "high"):
            self.assertTrue(caps.Requirements(effort=effort).violations(result))

    def test_auto_disabled_and_domestic_entries_are_not_inherited(self):
        sources = [("intl-work", [model(id="auto"), model(id="default-model"), model(id="disabled", disabled=True),
                                  model(id="non-chat", supportsToolCall=False), model()]),
                   ("cn-work", [model(id="domestic-only")])]
        result = share_models([], "intl-cli", sources)
        self.assertEqual([item["id"] for item in result], ["shared-model"])
        self.assertNotIn("isDefault", result[0])

    def test_provenance_cannot_be_forged_or_leak_duplicate_private_variants(self):
        native = model(catalog_source={"kind": "shared", "profiles": ["cn-cli"]}, source_variants=[{"secret": "secret"}])
        data = caps.describe_models([("intl-cli", native)])["metadata_by_profile"]["intl-cli"][0]
        self.assertEqual(data["catalog_source"], {"kind": "direct", "profiles": ["intl-cli"]})
        self.assertNotIn("source_variants", data)
        sources = [("intl-work", [model(uid="a"), model(uid="b")])]
        data = caps.describe_models([("intl-cli", share_models([], "intl-cli", sources)[0])])
        self.assertEqual(len(data["metadata_by_profile"]["intl-cli"][0]["source_variants"]), 1)

    def test_requested_model_does_not_materialize_unrelated_shared_models(self):
        models = [model(id=f"model-{i}") for i in range(100)]
        result = share_models([], "intl-cli", [("intl-work", models)], model_id="model-42")
        self.assertEqual([item["id"] for item in result], ["model-42"])


class RoutingTests(fixtures.GatewayFixture, unittest.TestCase):
    def configure(self, cli=None, work=None, balances=None):
        self.fx.configure(profiles=("intl-cli", "intl-work"), balances=balances)
        self.fx.account_catalogs({"intl-cli": [model(id="native-cli")] if cli is None else cli,
                                 "intl-work": [model(maxOutputTokens=256)] if work is None else work})

    def bind(self, target="intl-cli"):
        store = ControlStore(self.fx.root / "shared-control.sqlite3")
        self.addCleanup(store.close)
        store.update_model("shared-model", {"profile": target}, store.snapshot()["revision"], {"shared-model"})
        return self.enterContext(patch.dict(gateway.CONFIG, control_store=store))

    def test_all_protocols_and_modes_use_cli_identity_for_inherited_work_model(self):
        self.configure()
        original = deepcopy(gateway.CONFIG["account_catalogs"])
        self.bind()
        for protocol in fixtures.fixtures.GENERATIONS:
            for stream in (False, True):
                with self.subTest(protocol=protocol, stream=stream):
                    self.fx.post_ok(protocol, image_payload(self.fx, protocol, stream=stream), {"intl-cli"})
        self.assertEqual(gateway.CONFIG["account_catalogs"], original)
        self.assertEqual(self.fx.pool._capacity._counts, {})
        data = self.fx.client.get("/v1/models").json()["data"]
        public = next(item for item in data if item["id"] == "shared-model")
        self.assertEqual(set(public["metadata_by_profile"]), {"intl-cli"})
        self.assertEqual(public["credits_by_profile"], {"intl-cli": 0})
        self.assertEqual(public["metadata_by_profile"]["intl-cli"][0]["catalog_source"]["profiles"], ["intl-work"])

    def test_work_can_inherit_cli_and_both_products_deduplicate_shared_ids(self):
        self.configure(cli=[model()], work=[model(id="native-work")])
        self.bind("intl-work")
        self.fx.post_ok("chat/completions", self.fx.payload(), {"intl-work"})
        item = caps.entry_model(gateway, self.fx.entries["intl-work"], "shared-model")
        self.assertIsInstance(item, SharedModel)
        public = self.fx.client.get("/v1/models").json()["data"]
        self.assertEqual(sum(item["id"] == "shared-model" for item in public), 1)

    def test_native_image_and_price_declarations_win_over_shared_claims(self):
        self.configure(cli=[model(supportsImages=False, credits="x1.00")])
        self.bind()
        response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.fx.requests, [])
        self.assertFalse(self.fx.pool._model_free(self.fx.entries["intl-cli"], "shared-model"))

    def test_unknown_target_catalog_remains_not_ready(self):
        self.configure()
        gateway.CONFIG["account_catalogs"][self.fx.entries["intl-cli"]["account_key"]]["models"] = None
        self.bind()
        response = self.fx.client.post("/v1/chat/completions", json=self.fx.payload())
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(self.fx.requests, [])

    def test_balance_is_not_borrowed_from_source_account(self):
        self.configure()
        self.bind()
        for balance in (None, 0):
            self.configure(work=[model(credits="x1.00")], balances={"intl-cli": balance, "intl-work": 100})
            response = self.fx.client.post("/v1/chat/completions", json=self.fx.payload())
            self.assertNotEqual(response.status_code, 200)
            self.assertEqual(self.fx.requests, [])

    def test_ready_international_accounts_share_models_without_lending_balances(self):
        self.fx.add_account("second-cli", "intl-cli")
        self.fx.configure(profiles=("intl-cli", "second-cli"), balances={"intl-cli": 100, "second-cli": 0})
        self.fx.account_catalogs({"intl-cli": [model(id="native")], "second-cli": [model(credits="x1.00")]})
        self.fx.post_ok("chat/completions", self.fx.payload(), {"intl-cli"})
        self.assertFalse(self.fx.pool._eligible(self.fx.entries["second-cli"], "shared-model"))
        metadata = caps.entry_model(gateway, self.fx.entries["intl-cli"], "shared-model")
        self.assertIsInstance(metadata, SharedModel)


    def test_disabled_deleted_or_misowned_sources_do_not_authorize_shared_models(self):
        self.configure()
        target = self.fx.entries["intl-cli"]
        self.assertIsNotNone(caps.entry_model(gateway, target, "shared-model"))
        with patch.object(gateway.model_policy, "credential_enabled", side_effect=lambda config, entry: entry["profile"] != "intl-work"):
            self.assertIsNone(caps.entry_model(gateway, target, "shared-model"))
        source = gateway.CONFIG["account_catalogs"][self.fx.entries["intl-work"]["account_key"]]
        source["profile"] = "cn-work"
        self.assertIsNone(caps.entry_model(gateway, target, "shared-model"))
        del gateway.CONFIG["account_catalogs"][self.fx.entries["intl-work"]["account_key"]]
        self.assertIsNone(caps.entry_model(gateway, target, "shared-model"))

    def test_capabilities_are_rechecked_after_source_changes_during_header_acquisition(self):
        self.configure()
        self.bind()
        cm = self.fx.entries["intl-cli"]["cm"]
        original = cm.get_headers
        def changed():
            headers = original()
            gateway.CONFIG["account_catalogs"][self.fx.entries["intl-work"]["account_key"]]["models"][0]["supportsImages"] = False
            return headers
        with patch.object(cm, "get_headers", side_effect=changed):
            response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.fx.requests, [])
        self.assertEqual(self.fx.pool._capacity._counts, {})

    def test_bound_inherited_model_rejection_does_not_escape_or_hide_behind_other_product(self):
        self.configure()
        self.bind()
        cm = self.fx.entries["intl-cli"]["cm"]
        self.fx.pool.note_status(cm, 404, model="shared-model",
                                raw=b'{"code":11102,"msg":"service info not found"}')
        response = self.fx.client.post("/v1/chat/completions", json=self.fx.payload())
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(self.fx.requests, [])
        self.assertTrue(self.fx.pool._model_servable(self.fx.entries["intl-work"], "shared-model"))


    def test_switch_off_preserves_shared_model_selection_and_guard_boundaries(self):
        self.configure(work=[model(supportsImages=False)])
        self.bind()
        with patch.dict(gateway.CONFIG, model_capability_guard=False):
            self.fx.post_ok("chat/completions", image_payload(self.fx, "chat/completions"), {"intl-cli"})
            self.assertFalse(self.fx.pool._eligible(self.fx.entries["intl-work"], "shared-model"))


if __name__ == "__main__":
    unittest.main()
