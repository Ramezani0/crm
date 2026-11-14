"""Unit tests for Iran Payamak helpers — no network, no Postgres."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import sms


class NormalizeMobileTests(unittest.TestCase):
    def test_local_plus98_and_persian_digits(self):
        self.assertEqual(sms.normalize_mobile("09138917291"), "09138917291")
        self.assertEqual(sms.normalize_mobile("+989180089780"), "09180089780")
        self.assertEqual(sms.normalize_mobile("۹۱۳۳۹۳۸۵۴۳"), "09133938543")
        self.assertEqual(sms.normalize_mobile("  0912 097 3209 "), "09120973209")

    def test_does_not_invent_digits(self):
        self.assertEqual(sms.normalize_mobile(""), "")
        self.assertEqual(sms.normalize_mobile("123"), "")
        self.assertEqual(sms.normalize_mobile("—"), "")


class WhitelistTests(unittest.TestCase):
    def test_exact_six_numbers(self):
        self.assertEqual(len(sms.SMS_INBOUND_WHITELIST), 6)
        self.assertTrue(sms.is_whitelisted_mobile("09138917291"))
        self.assertTrue(sms.is_whitelisted_mobile("+989386674005"))
        self.assertFalse(sms.is_whitelisted_mobile("09120000000"))
        self.assertFalse(sms.is_whitelisted_mobile("0913891729"))  # too short

    def test_non_whitelist_does_not_create_task(self):
        self.assertIsNone(
            sms.essential_task_from_sms({"from": "09121111111", "text": "پیگیری"})
        )

    def test_whitelist_creates_not_done_status(self):
        task = sms.essential_task_from_sms(
            {"from": "09133938543", "text": "پیگیری قسط", "id": "m1"}
        )
        self.assertIsNotNone(task)
        self.assertEqual(task["status"], "نشد")
        self.assertEqual(task["from"], "09133938543")
        self.assertEqual(task["body"], "پیگیری قسط")


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "sms-store.json"
        self.env = mock.patch.dict(os.environ, {"FASIHI_SMS_STORE": str(self.path)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_ingest_skips_non_whitelist_and_keeps_status_on_duplicate(self):
        first = sms.ingest_inbound({"from": "09138917291", "text": "کار ضروری", "id": "A"})
        self.assertTrue(first["accepted"])
        sms.set_task_status("A", "درحال‌انجام")
        again = sms.ingest_inbound({"from": "09138917291", "text": "کار ضروری", "id": "A"})
        self.assertTrue(again["duplicate"])
        self.assertEqual(again["task"]["status"], "درحال‌انجام")
        rejected = sms.ingest_inbound({"from": "09120000000", "text": "اسپم"})
        self.assertFalse(rejected["accepted"])
        tasks = sms.list_tasks()
        self.assertEqual(len(tasks), 1)

    def test_status_must_be_exact_persian(self):
        sms.ingest_inbound({"from": "09213908586", "text": "x", "id": "B"})
        bad = sms.set_task_status("B", "done")
        self.assertFalse(bad["ok"])
        ok = sms.set_task_status("B", "انجام‌شد")
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["task"]["status"], "انجام‌شد")

    def test_store_file_has_no_secrets(self):
        sms.ingest_inbound({"from": "09180089780", "text": "hello", "id": "C"})
        raw = self.path.read_text(encoding="utf-8")
        self.assertNotIn("IRANPAYAMAK", raw)
        self.assertNotIn("password", raw.lower())
        json.loads(raw)


class ConfigAndNotifyTests(unittest.TestCase):
    def test_line_aliases(self):
        base = {
            "IRANPAYAMAK_LINE": "",
            "IRANPAYAMAK_LINE_NUMBER": "",
            "LINE_NUMBER": "",
            "IRANPAYAMAK_FROM": "",
        }
        with mock.patch.dict(os.environ, {**base, "IRANPAYAMAK_LINE": "5000"}):
            self.assertEqual(sms.line_number(), "5000")
        with mock.patch.dict(os.environ, {**base, "LINE_NUMBER": "5001"}):
            self.assertEqual(sms.line_number(), "5001")

    def test_public_status_never_includes_secrets(self):
        env = {
            "IRANPAYAMAK_API_KEY": "secret-key",
            "IRANPAYAMAK_PASSWORD": "secret-pass",
            "IRANPAYAMAK_USERNAME": "panel-user",
            "IRANPAYAMAK_LINE": "5000123",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            pub = sms.sms_status_public()
        blob = json.dumps(pub)
        self.assertNotIn("secret-key", blob)
        self.assertNotIn("secret-pass", blob)
        self.assertTrue(pub["configured"])
        self.assertTrue(pub["hasPassword"])
        self.assertTrue(pub["hasApiKey"])
        self.assertEqual(pub["notifyMobile"], "09138917291")

    def test_notify_text_and_locked_recipient(self):
        self.assertEqual(sms.SITE_CHANGE_NOTIFY_MOBILE, "09138917291")
        text = sms.format_site_change_sms("customer_create", "فاطمه محمدی")
        self.assertIn("مشتری جدید", text)
        self.assertIn("فاطمه محمدی", text)
        self.assertEqual(sms.format_site_change_sms("settings_save", ""), "")

    def test_send_without_env_is_stub(self):
        with mock.patch.dict(
            os.environ,
            {
                "IRANPAYAMAK_API_KEY": "",
                "IRANPAYAMAK_USERNAME": "",
                "IRANPAYAMAK_PASSWORD": "",
                "IRANPAYAMAK_LINE": "",
                "IRANPAYAMAK_LINE_NUMBER": "",
                "LINE_NUMBER": "",
            },
            clear=False,
        ):
            result = sms.send_iranpayamak("hi", ["09138917291"])
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], sms.SMS_ENV_ERROR)
        self.assertTrue(result.get("stub"))


if __name__ == "__main__":
    unittest.main()
