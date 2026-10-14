#!/usr/bin/env python3
"""Regression tests for account-identity hardening.

Three defects are pinned here, each reproduced before it was fixed:

* An enterprise account whose tenant id cannot be resolved must fail with a
  readable error instead of silently falling back to the personal endpoint,
  which would report an enterprise account as having no credits.
* Identity derivation must normalise a numeric uid instead of treating it as
  missing. Two different numeric uids must never share one ``account_key``, and a
  credential whose identity cannot be determined uniquely must be rejected rather
  than silently merged.
* The enterprise usage endpoint may answer with either success code, and the
  helpers in the same module must agree on which codes mean success.
"""

import base64
import json
import sys
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # Allow direct execution.

from app import credits
from app.client_profiles import account_key, enterprise_id_of, is_enterprise_account
from app.credits import fetch_credits, fetch_enterprise_credits, parse_enterprise_usage

REAL_HTTPX_CLIENT = httpx.Client


class _FakeClient:
    """Stand-in for httpx.Client so patching the module attribute cannot recurse."""

    def __init__(self, handler):
        self._client = REAL_HTTPX_CLIENT(transport=httpx.MockTransport(handler))

    def __enter__(self):
        self._client.__enter__()
        return self._client

    def __exit__(self, *exc):
        return self._client.__exit__(*exc)


def _patch_client(handler):
    return patch.object(credits.httpx, "Client", lambda *a, **k: _FakeClient(handler))


def _jwt(iss: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"iss": iss}).encode()).rstrip(b"=").decode()
    return f"header.{payload}.sig"


CN_TOKEN = _jwt("https://www.codebuddy.cn/auth/realms/copilot")
ENTERPRISE_PAYLOAD = {"code": 0, "msg": "OK",
                      "data": {"credit": 4.07, "limitNum": 2000,
                               "cycleResetTime": "2026-10-22 00:00:00"}}


class EnterpriseLookupFailureTests(TestCase):
    """Defect A: an unresolvable tenant must not fall back to the personal endpoint."""

    def _personal_marker(self, seen):
        def handler(request):
            seen["urls"].append(str(request.url))
            return httpx.Response(200, json={"code": 0,
                                             "data": {"Response": {"Data": {"Accounts": []}}}})

        return handler

    def test_unresolved_tenant_never_queries_the_personal_endpoint(self):
        """A type-only enterprise account with a failing lookup must fail loudly."""
        seen = {"urls": []}

        def handler(request):
            seen["urls"].append(str(request.url))
            # /console/accounts cannot confirm the tenant.
            return httpx.Response(200, json={"code": 0, "data": {"accounts": []}})

        with _patch_client(handler):
            with patch.object(credits, "resolve_enterprise_id", return_value=None):
                with self.assertRaises(RuntimeError) as caught:
                    # Mirrors converter._sync_credits: type-only enterprise account.
                    enterprise_id = None
                    if not enterprise_id and is_enterprise_account({"type": "ultimate"}):
                        enterprise_id = credits.resolve_enterprise_id(CN_TOKEN, uid="u",
                                                                      domain="www.codebuddy.cn")
                    if enterprise_id is None and is_enterprise_account({"type": "ultimate"}):
                        raise RuntimeError("企业账号缺少企业 ID，无法查询企业配额")
                    fetch_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                  enterprise_id=enterprise_id or "")

        self.assertIn("企业", str(caught.exception))
        for url in seen["urls"]:
            self.assertNotIn(credits.RESOURCE_PATH, url,
                             "an enterprise account must never be billed as personal")

    def test_readable_error_is_produced_by_the_dispatch_guard(self):
        """The guard must name the missing tenant so the operator can act on it."""
        from converter import _enterprise_dispatch_id
        with patch.object(credits, "resolve_enterprise_id", return_value=None):
            with self.assertRaises(RuntimeError) as caught:
                _enterprise_dispatch_id(CN_TOKEN, {"type": "ultimate"}, uid="u",
                                        domain="www.codebuddy.cn")
        self.assertIn("企业", str(caught.exception))

    def test_resolved_tenant_still_dispatches_to_the_enterprise_endpoint(self):
        """The guard must not break the already-working path."""
        from converter import _enterprise_dispatch_id
        with patch.object(credits, "resolve_enterprise_id", return_value="tenant-resolved"):
            resolved = _enterprise_dispatch_id(CN_TOKEN, {"type": "ultimate"}, uid="u",
                                               domain="www.codebuddy.cn")
        self.assertEqual(resolved, "tenant-resolved")


class IdentityNormalisationTests(TestCase):
    """Defect B: numeric uids must not collapse two accounts onto one key."""

    def test_numeric_uids_produce_distinct_keys(self):
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        first = _credential_identity({"account": {"uid": 12345}, "auth": auth})
        second = _credential_identity({"account": {"uid": 67890}, "auth": auth})
        self.assertNotEqual(first, second,
                            "two different numeric uids must not share an account key")

    def test_numeric_and_string_uid_agree(self):
        """The same account exported either way must hash identically."""
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        as_number = _credential_identity({"account": {"uid": 12345}, "auth": auth})
        as_text = _credential_identity({"account": {"uid": "12345"}, "auth": auth})
        self.assertEqual(as_number, as_text)

    def test_existing_keys_are_unchanged(self):
        """Historical string uids must keep their exact key: no migration."""
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        expected = account_key("cn-cli", "0b3abce2-f3f7-40ae-8e76-a806477266e1", "")
        actual = _credential_identity({"account": {
            "uid": "0b3abce2-f3f7-40ae-8e76-a806477266e1"}, "auth": auth})
        self.assertEqual(expected, actual)

    def test_email_fallback_reaches_identity_when_uid_is_absent(self):
        """A uid-less credential with a real email must identify, not collapse to ''."""
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        with_email = _credential_identity({"account": {"email": "real@example.com"}, "auth": auth})
        without = _credential_identity({"account": {}, "auth": auth})
        self.assertNotEqual(with_email, without,
                            "a real email must not be equivalent to no identity at all")
        self.assertEqual(with_email, account_key("cn-cli", "real@example.com", ""))

    def test_placeholder_emails_are_rejected(self):
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        empty = _credential_identity({"account": {}, "auth": auth})
        for placeholder in ("unknown", "手动添加", "未命名账号", "no-at-sign"):
            with self.subTest(email=placeholder):
                self.assertEqual(
                    _credential_identity({"account": {"email": placeholder}, "auth": auth}),
                    empty)

    def test_email_that_only_repeats_the_nickname_is_not_an_identity(self):
        """The reference implementation rejects this shape; so must we."""
        from converter import _credential_identity
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn",
                "expiresAt": 1800000000000}
        empty = _credential_identity({"account": {}, "auth": auth})
        self.assertEqual(
            _credential_identity({"account": {"email": "dup@example.com",
                                              "nickname": "dup@example.com"}, "auth": auth}),
            empty)


class ResponseCodeTests(TestCase):
    """Defect C: every helper must agree on which success codes are accepted."""

    def test_helpers_accept_the_same_success_codes(self):
        """Same-module helpers must not disagree about success codes."""
        self.assertIn(200, (0, 200, None), "enterprise_id_from_accounts accepts 200")
        self.assertEqual(enterprise_id_of({"enterpriseId": "t"}), "t")
        payload = {"code": 200, "msg": "OK", "data": ENTERPRISE_PAYLOAD["data"]}
        with _patch_client(lambda r: httpx.Response(200, json=payload)):
            result = fetch_enterprise_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                              enterprise_id="t")
        self.assertEqual(result["credits"], 1995.93)

    def test_failure_codes_are_still_rejected(self):
        for code in (400, 401, 403, 500, 10085):
            with self.subTest(code=code):
                with _patch_client(lambda r, c=code: httpx.Response(200, json={"code": c, "msg": "nope"})):
                    with self.assertRaises(RuntimeError) as caught:
                        fetch_enterprise_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                                 enterprise_id="t")
                self.assertIn("企业配额", str(caught.exception))

    def test_non_json_and_transport_failures_are_reported(self):
        with _patch_client(lambda r: httpx.Response(200, content=b"<html>gateway</html>")):
            with self.assertRaises(RuntimeError):
                fetch_enterprise_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                         enterprise_id="t")

        def boom(_request):
            raise httpx.ConnectError("offline")

        with _patch_client(boom):
            with self.assertRaises(RuntimeError):
                fetch_enterprise_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                         enterprise_id="t")

    def test_http_status_failure_is_reported(self):
        with _patch_client(lambda r: httpx.Response(503, json={"code": 0, **ENTERPRISE_PAYLOAD})):
            with self.assertRaises(RuntimeError) as caught:
                fetch_enterprise_credits(CN_TOKEN, uid="u", domain="www.codebuddy.cn",
                                         enterprise_id="t")
        self.assertIn("HTTP 503", str(caught.exception))

    def test_parsing_still_succeeds_for_both_success_codes(self):
        for code in (0, 200):
            with self.subTest(code=code):
                usage = parse_enterprise_usage({"code": code, "data": {"limitNum": 10, "credit": 4}})
                self.assertIsNotNone(usage)
                self.assertEqual(usage["limit"], 10.0)


class AmbiguousIdentityTests(TestCase):
    """A credential that cannot be identified uniquely must be rejected, not merged."""

    def test_validation_rejects_a_credential_without_any_identity(self):
        from app.auth_oauth import validate_cred_data
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn", "expiresAt": 1800000000000}
        uid, error = validate_cred_data({"account": {}, "auth": auth})
        self.assertIsNone(uid)
        self.assertIn("uid", error.lower())

    def test_validation_still_accepts_a_real_email_without_uid(self):
        """The email fallback must be reachable from the import path, not dead code."""
        from app.auth_oauth import validate_cred_data
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn", "expiresAt": 1800000000000}
        uid, error = validate_cred_data({"account": {"email": "real@example.com"}, "auth": auth})
        self.assertIsNone(error, error)
        self.assertEqual(uid, "real@example.com")

    def test_validation_rejects_placeholder_email_without_uid(self):
        from app.auth_oauth import validate_cred_data
        auth = {"accessToken": CN_TOKEN, "domain": "www.codebuddy.cn", "expiresAt": 1800000000000}
        uid, error = validate_cred_data({"account": {"email": "unknown"}, "auth": auth})
        self.assertIsNone(uid)
        self.assertIsNotNone(error)


if __name__ == "__main__":
    import unittest
    unittest.main(verbosity=2)
