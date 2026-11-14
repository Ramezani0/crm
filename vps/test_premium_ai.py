"""Unit tests for premium AI helpers (no network, no secrets)."""
from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

APP_PATH = Path(__file__).resolve().parent / "app.py"


def load_app():
    spec = importlib.util.spec_from_file_location("fasihi_app_premium_ai", APP_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # Avoid requiring psycopg/sms at import for pure helper tests by stubbing
    sys.modules.setdefault("psycopg", mock.MagicMock())
    sys.modules.setdefault("psycopg.rows", mock.MagicMock())
    sys.modules.setdefault("sms_panel", mock.MagicMock())
    sys.modules.setdefault("bimebazar_client", mock.MagicMock())
    spec.loader.exec_module(mod)
    return mod


class CoerceMessagesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_messages_list_preferred(self):
        out = self.app.coerce_premium_ai_messages(
            {"messages": [{"role": "user", "content": "hi"}], "text": "ignored"}
        )
        self.assertEqual(out[0]["content"], "hi")

    def test_alias_fields(self):
        for key in ("message", "text", "prompt", "content", "q"):
            out = self.app.coerce_premium_ai_messages({key: "سلام"})
            self.assertEqual(out, [{"role": "user", "content": "سلام"}], key)

    def test_empty(self):
        self.assertEqual(self.app.coerce_premium_ai_messages({}), [])
        self.assertEqual(self.app.coerce_premium_ai_messages({"messages": []}), [])


class FriendlyErrorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_status_codes(self):
        self.assertIn("محدود", self.app._gemini_friendly_error(403, {"error": {"status": "PERMISSION_DENIED"}}))
        self.assertIn("۴۰۴", self.app._gemini_friendly_error(404, {}))
        self.assertIn("۵۰۳", self.app._gemini_friendly_error(503, {"error": {"status": "UNAVAILABLE"}}))
        self.assertIn("تایم", self.app._gemini_friendly_error(408, {}))
        self.assertNotIn("AIza", self.app._gemini_friendly_error(403, {"error": {"message": "bad AIzaXXX key"}}))


class TimeoutConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_clamp(self):
        with mock.patch.dict(os.environ, {"PREMIUM_AI_TIMEOUT_SEC": "1"}, clear=False):
            self.assertEqual(self.app.premium_ai_timeout_sec(), 3.0)
        with mock.patch.dict(os.environ, {"PREMIUM_AI_TIMEOUT_SEC": "99"}, clear=False):
            self.assertEqual(self.app.premium_ai_timeout_sec(), 20.0)
        with mock.patch.dict(os.environ, {"PREMIUM_AI_TIMEOUT_SEC": "8"}, clear=False):
            self.assertEqual(self.app.premium_ai_timeout_sec(), 8.0)
        with mock.patch.dict(os.environ, {"PREMIUM_AI_TIMEOUT_SEC": "nope"}, clear=False):
            self.assertEqual(self.app.premium_ai_timeout_sec(), 8.0)


class SendFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def _env(self):
        return mock.patch.dict(
            os.environ,
            {
                "PREMIUM_AI_API_KEY": "test-key-not-real",
                "PREMIUM_AI_MODEL": "gemini-3.8-flash",
                "PREMIUM_AI_MODEL_FALLBACK": "gemini-flash-latest",
                "PREMIUM_AI_PROVIDER": "gemini",
                "PREMIUM_AI_TIMEOUT_SEC": "8",
            },
            clear=False,
        )

    def test_fallback_after_403(self):
        calls = []

        def fake_http(url, payload, headers, timeout=8):
            calls.append(("http", url, timeout))
            if "gemini-3.8-flash" in url:
                return {
                    "ok": False,
                    "status": 403,
                    "result": {"error": {"status": "PERMISSION_DENIED", "message": "Forbidden"}},
                    "error": self.app.PREMIUM_AI_KEY_403,
                    "code": "premium_ai_http_error",
                }
            return {
                "ok": True,
                "status": 200,
                "result": {
                    "candidates": [{"content": {"parts": [{"text": "پاسخ تست"}]}}],
                },
            }

        with self._env(), mock.patch.object(
            self.app, "_http_json_premium", side_effect=fake_http
        ), mock.patch.object(self.app.time, "sleep", return_value=None):
            result = self.app.send_premium_ai_chat([{"role": "user", "content": "سلام"}])

        self.assertTrue(result.get("ok"), result)
        self.assertEqual(result.get("model"), "gemini-flash-latest")
        self.assertEqual(result.get("content"), "پاسخ تست")
        # primary once (no 403 retry) then fallback once
        self.assertEqual(len(calls), 2)
        self.assertTrue(any("gemini-flash-latest" in u for _, u, _ in calls))

    def test_timeout_then_fallback(self):
        calls = []

        def fake_http(url, payload, headers, timeout=8):
            calls.append(("http", url, float(timeout)))
            if "gemini-3.8-flash" in url:
                return {
                    "ok": False,
                    "status": 408,
                    "error": self.app.PREMIUM_AI_TIMEOUT_ERROR,
                    "code": "premium_ai_timeout",
                    "result": {},
                }
            return {
                "ok": True,
                "status": 200,
                "result": {
                    "candidates": [{"content": {"parts": [{"text": "از فال‌بک"}]}}],
                },
            }

        with self._env(), mock.patch.object(
            self.app, "_http_json_premium", side_effect=fake_http
        ), mock.patch.object(self.app.time, "sleep", return_value=None):
            result = self.app.send_premium_ai_chat([{"role": "user", "content": "سلام"}])

        self.assertTrue(result.get("ok"), result)
        self.assertEqual(result.get("model"), "gemini-flash-latest")
        self.assertEqual(result.get("content"), "از فال‌بک")
        # timeout must NOT retry primary — only fallback
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(t <= 20 for _, _, t in calls))

    def test_no_retry_on_timeout_without_fallback(self):
        calls = []

        def fake_http(url, payload, headers, timeout=8):
            calls.append(url)
            return {
                "ok": False,
                "status": 408,
                "error": self.app.PREMIUM_AI_TIMEOUT_ERROR,
                "code": "premium_ai_timeout",
                "result": {},
            }

        with mock.patch.dict(
            os.environ,
            {
                "PREMIUM_AI_API_KEY": "test-key-not-real",
                "PREMIUM_AI_MODEL": "gemini-3.8-flash",
                "PREMIUM_AI_MODEL_FALLBACK": "",
                "PREMIUM_AI_PROVIDER": "gemini",
            },
            clear=False,
        ), mock.patch.object(
            self.app, "_http_json_premium", side_effect=fake_http
        ), mock.patch.object(self.app.time, "sleep", return_value=None):
            result = self.app.send_premium_ai_chat([{"role": "user", "content": "سلام"}])

        self.assertFalse(result.get("ok"))
        self.assertEqual(result.get("code"), "premium_ai_timeout")
        self.assertIn("تایم", result.get("error") or "")
        self.assertEqual(len(calls), 1)

    def test_503_retries_once_then_fallback(self):
        calls = []

        def fake_http(url, payload, headers, timeout=8):
            calls.append(url)
            if "gemini-3.8-flash" in url:
                return {
                    "ok": False,
                    "status": 503,
                    "result": {"error": {"status": "UNAVAILABLE"}},
                    "error": "سرویس Gemini موقتاً شلوغ است (۵۰۳)",
                    "code": "premium_ai_http_error",
                }
            return {
                "ok": True,
                "status": 200,
                "result": {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            }

        with self._env(), mock.patch.object(
            self.app, "_http_json_premium", side_effect=fake_http
        ), mock.patch.object(self.app.time, "sleep", return_value=None):
            result = self.app.send_premium_ai_chat([{"role": "user", "content": "سلام"}])

        self.assertTrue(result.get("ok"), result)
        # primary + one 503 retry + fallback
        self.assertEqual(len(calls), 3)


class StatusPublicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_fallback_configured_and_403_hint(self):
        def fake_http(url, payload, headers, timeout=8):
            return {
                "ok": False,
                "status": 403,
                "result": {"error": {"status": "PERMISSION_DENIED"}},
                "error": self.app.PREMIUM_AI_KEY_403,
                "code": "premium_ai_http_error",
            }

        with mock.patch.dict(
            os.environ,
            {
                "PREMIUM_AI_API_KEY": "test-key-not-real",
                "PREMIUM_AI_MODEL": "gemini-3.8-flash",
                "PREMIUM_AI_MODEL_FALLBACK": "gemini-flash-latest",
                "PREMIUM_AI_PROVIDER": "gemini",
            },
            clear=False,
        ), mock.patch.object(self.app, "_http_json_premium", side_effect=fake_http):
            st = self.app.premium_ai_status_public()

        self.assertTrue(st.get("fallbackConfigured"))
        self.assertEqual(st.get("error"), self.app.PREMIUM_AI_KEY_403)
        self.assertNotIn("_api_key", st)
        self.assertNotIn("AIza", str(st))

    def test_fallback_configured_false(self):
        with mock.patch.dict(
            os.environ,
            {
                "PREMIUM_AI_API_KEY": "",
                "PREMIUM_AI_MODEL_FALLBACK": "",
                "PREMIUM_AI_PROVIDER": "gemini",
            },
            clear=False,
        ):
            st = self.app.premium_ai_status_public()
        self.assertFalse(st.get("fallbackConfigured"))


class HttpPremiumTimeoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_socket_timeout_maps_to_408(self):
        with mock.patch.object(
            self.app.urllib.request, "urlopen", side_effect=TimeoutError("timed out")
        ):
            out = self.app._http_json_premium(
                "https://example.invalid/x", {"a": 1}, {}, timeout=3
            )
        self.assertFalse(out.get("ok"))
        self.assertEqual(out.get("status"), 408)
        self.assertEqual(out.get("code"), "premium_ai_timeout")
        self.assertNotIn("پیامک", out.get("error") or "")


if __name__ == "__main__":
    unittest.main()
