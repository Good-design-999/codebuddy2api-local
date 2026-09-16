"""Verify public model declarations and bounded preflight without real credentials or network calls."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
import converter as gateway
from app import model_capabilities as caps
from app.control_store import ControlStore
from app.request_context import RequestContext, ensure_context
import test_api_flow as fixtures

IMAGE = {"type": "image_url", "image_url": {"url": "https://example.invalid/image.png", "detail": "low"}}


def model(**values):
    return {"id": "shared-model", "name": "Example", "credits": "x0.00", "supportsToolCall": True,
            "supportsImages": True, "supportsReasoning": True, **values}


def image_payload(fx, protocol, *, stream=False):
    body = fx.payload(protocol, stream=stream)
    if protocol == "responses":
        body["input"][0]["content"] = [{"type": "input_image", "image_url": IMAGE["image_url"]["url"]}]
    elif protocol == "messages":
        body["messages"][0]["content"] = [{"type": "image", "source": {"type": "url", "url": IMAGE["image_url"]["url"]}}]
    else:
        body["messages"][0]["content"] = [deepcopy(IMAGE)]
    return body


class MetadataTests(unittest.TestCase):
    def test_schema_preserves_safe_fields_without_including_private_extensions(self):
        raw = model(descriptionZh="模型说明", descriptionEn="Description", vendor="example", tags=["fast"],
                    maxInputTokens=8192, maxOutputTokens=1024, maxAllowedSize=8192, isDefault=True,
                    disabledMultimodal=False, onlyReasoning=True, canDisableThinking=False, supportsExtra=True,
                    iconUrl="https://example.invalid/model.svg", temperature=0.5, top_p=0.8, top_k=40,
                    repetition_penalty=1.0, summary="auto", reasoning={"effort": "high", "defaultEffort": "high",
                    "summary": "auto", "supportedEfforts": ["low", "high"], "canDisableThinking": False},
                    relatedModels={"lite": "light", "reasoning": "heavy"},
                    contextWindow={"defaultLength": 8192, "supportedLengths": [4096, 8192]})
        original = deepcopy(raw)
        raw.update(accessToken="secret-canary", headers={"Authorization": "secret-canary"}, uid="private-account")
        raw["reasoning"]["token"] = "secret-canary"
        self.assertEqual(caps.sanitize_model(raw), original)
        self.assertNotIn("secret-canary", json.dumps(caps.describe_models([("intl-cli", raw)])))

    def test_secret_strings_urls_and_invalid_numeric_types_are_not_published(self):
        raw = model(descriptionZh="Authorization: Bearer synthetic-canary", iconUrl="https://x.invalid/icon?token=secret",
                    maxInputTokens=True, maxOutputTokens=-1, temperature=float("inf"), tags=["fast", {"token": "secret"}])
        safe = caps.sanitize_model(raw)
        self.assertNotIn("synthetic-canary", json.dumps(safe))
        for key in ("iconUrl", "maxInputTokens", "maxOutputTokens", "temperature"):
            self.assertNotIn(key, safe)
        self.assertEqual(safe["tags"], ["fast"])

    def test_conflicting_profiles_and_account_variants_are_preserved(self):
        yes = model(maxOutputTokens=1024)
        no = model(supportsImages=False, maxOutputTokens=512)
        data = caps.describe_models([("cn-cli", yes), ("intl-work", no), ("intl-work", yes), ("cn-cli", yes)])
        self.assertEqual(data["capabilities"]["images"], "mixed")
        self.assertEqual(data["limits"]["maxOutputTokens"], {"state": "mixed", "value": None})
        self.assertEqual(len(data["metadata_by_profile"]["cn-cli"]), 1)
        self.assertEqual(len(data["metadata_by_profile"]["intl-work"]), 2)
        self.assertEqual(caps.describe_models([("cn-cli", yes), ("cn-work", {})])["capabilities"]["images"], "unknown")

    def test_explicit_modality_disable_and_conflicting_thinking_flags(self):
        self.assertIs(caps.capabilities(model(disabledMultimodal=True))["images"], False)
        self.assertIsNone(caps.capabilities(model(onlyReasoning=True, canDisableThinking=True))["thinking_disable"])
        self.assertIsNone(caps.capabilities({"supportsImages": "false"})["images"])

    def test_requirements_only_enforce_known_declarations_and_mapped_limits(self):
        req = caps.Requirements(images=True, tools=True, effort="high", max_output=2048)
        self.assertEqual(req.violations({}), [])
        errors = req.violations(model(supportsImages=False, supportsToolCall=False, supportsReasoning=False,
                                    maxOutputTokens=1024, reasoning={"supportedEfforts": ["low"]}))
        self.assertEqual({e[0] for e in errors}, {"unsupported_image_input", "unsupported_tools", "unsupported_reasoning",
                                               "unsupported_reasoning_effort", "model_output_limit"})
        self.assertEqual(caps.Requirements.from_request({"max_completion_tokens": 999999}).max_output, None)
        self.assertTrue(caps.Requirements(effort="none").violations(model(onlyReasoning=True)))

    def test_context_snapshots_guard_for_the_whole_request(self):
        config = {"model_capability_guard": False}
        scope = {"path": "/v1/chat/completions", "headers": []}
        context = ensure_context(scope, config)
        config["model_capability_guard"] = True
        self.assertIs(ensure_context(scope, config), context)
        self.assertIs(context.capability_guard, False)
        self.assertIs(RequestContext("chat").capability_guard, True)


class EndpointTests(fixtures.GatewayFixture, unittest.TestCase):
    def test_four_profiles_three_protocols_and_modes_reject_before_acquiring_capacity(self):
        for profile in fixtures.fixtures.PROFILES:
            self.fx.configure(profiles=(profile,))
            self.fx.account_catalogs({profile: [model(supportsImages=False)]})
            for protocol in fixtures.fixtures.GENERATIONS:
                for stream in (False, True):
                    with self.subTest(profile=profile, protocol=protocol, stream=stream):
                        before = len(self.fx.requests)
                        body = image_payload(self.fx, protocol, stream=stream)
                        original = deepcopy(body)
                        response = self.fx.client.post("/v1/" + protocol, json=body)
                        self.assertEqual(response.status_code, 400, response.text)
                        self.assertEqual(response.json()["error"]["code"], "unsupported_image_input")
                        self.assertEqual(len(self.fx.requests), before)
                        self.assertEqual(body, original)
                        self.assertEqual(self.fx.pool._capacity._counts, {})

    def test_disabling_only_new_preflight_keeps_model_metadata_and_routing(self):
        self.fx.configure(profiles=("intl-cli",))
        self.fx.account_catalogs({"intl-cli": [model(supportsImages=False)]})
        with patch.dict(gateway.CONFIG, model_capability_guard=False):
            for protocol in fixtures.fixtures.GENERATIONS:
                self.fx.post_ok(protocol, image_payload(self.fx, protocol), {"intl-cli"})
            item = self.fx.client.get("/v1/models").json()["data"][0]
            self.assertEqual(item["capabilities"]["images"], "unsupported")
            self.assertFalse(item["metadata_by_profile"]["intl-cli"][0]["supportsImages"])

    def test_unknown_images_are_not_treated_as_false(self):
        self.fx.configure(profiles=("cn-cli",))
        unknown = model()
        del unknown["supportsImages"]
        self.fx.account_catalogs({"cn-cli": [unknown]})
        self.fx.post_ok("chat/completions", image_payload(self.fx, "chat/completions"), {"cn-cli"})

    def test_capability_filter_cannot_escalate_from_free_to_paid(self):
        self.fx.configure(profiles=("cn-cli", "intl-work"))
        self.fx.account_catalogs({"intl-work": [model(supportsImages=False)],
                                 "cn-cli": [model(credits="x1.00")]})
        response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.fx.requests, [])

    def test_selects_a_compatible_account_without_crossing_strict_binding(self):
        self.fx.configure(profiles=("cn-cli", "intl-work"))
        self.fx.account_catalogs({"intl-work": [model(supportsImages=False)], "cn-cli": [model()]})
        self.fx.post_ok("chat/completions", image_payload(self.fx, "chat/completions"), {"cn-cli"})
        store = ControlStore(self.fx.root / "capabilities-control.sqlite3")
        self.addCleanup(store.close)
        store.update_model("shared-model", {"profile": "intl-work"}, store.snapshot()["revision"], {"shared-model"})
        with patch.dict(gateway.CONFIG, control_store=store):
            before = len(self.fx.requests)
            response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(len(self.fx.requests), before)
            item = self.fx.client.get("/v1/models").json()["data"][0]
            self.assertEqual(set(item["metadata_by_profile"]), {"intl-work"})

    def test_rechecks_capabilities_before_reserving_capacity(self):
        self.fx.configure(profiles=("intl-work",))
        self.fx.account_catalogs({"intl-work": [model()]})
        entry = self.fx.entries["intl-work"]
        original = entry["cm"].get_headers
        def refresh():
            headers = original()
            gateway.CONFIG["account_catalogs"][entry["account_key"]]["models"][0]["supportsImages"] = False
            return headers
        with patch.object(entry["cm"], "get_headers", side_effect=refresh):
            response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.fx.requests, [])
        self.assertEqual(self.fx.pool._capacity._counts, {})

    def test_pricing_snapshot_race_fails_closed_without_an_empty_error_crash(self):
        self.fx.configure(profiles=("intl-work",))
        entry = self.fx.entries["intl-work"]
        with patch.object(self.fx.pool, "_candidates", return_value=[entry]), patch.object(
                self.fx.pool, "_model_free", side_effect=[True, False]):
            with self.assertRaises(HTTPException) as error:
                self.fx.pool.pick(None, "shared-model", requirements=caps.Requirements(images=True))
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail["error"]["code"], "model_capability_not_ready")

    def test_compatible_but_full_free_account_does_not_spill_into_paid_capacity(self):
        self.fx.configure(profiles=("intl-work", "cn-cli"))
        self.fx.account_catalogs({"intl-work": [model()], "cn-cli": [model(credits="x1.00")]})
        entry = self.fx.entries["intl-work"]
        lease = self.fx.pool._capacity.acquire(entry["account_key"], 1, entry["cm"], entry["cm"]._generation)
        self.addCleanup(lease.release)
        with patch.dict(gateway.CONFIG, max_inflight_per_account=1):
            response = self.fx.client.post("/v1/chat/completions", json=image_payload(self.fx, "chat/completions"))
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(self.fx.requests, [])


    def test_output_limit_in_all_protocols_and_anthropic_thinking_requirements(self):
        self.fx.configure(profiles=("intl-work",))
        self.fx.account_catalogs({"intl-work": [model(maxOutputTokens=36, onlyReasoning=True)]})
        for protocol in fixtures.fixtures.GENERATIONS:
            response = self.fx.client.post("/v1/" + protocol, json=self.fx.payload(protocol))
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(response.json()["error"]["code"], "model_output_limit")
        body = self.fx.payload("messages")
        body.update(max_tokens=32, thinking={"type": "disabled"})
        response = self.fx.client.post("/v1/messages", json=body)
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json()["error"]["code"], "reasoning_required")
        self.assertEqual(self.fx.requests, [])


if __name__ == "__main__":
    unittest.main()
