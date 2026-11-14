#!/usr/bin/env python3
"""Mocked HTTP tests for BimeBazar premium-compare client — no live network."""
from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from unittest import mock

import bimebazar_client as bb


class PlateMapTests(unittest.TestCase):
    def test_maps_ui_plate_to_plk_fields(self):
        # Assumption: ب → plk2 "1" (0-based index in PLATE_LETTERS)
        plk = bb.map_plate_to_plk(
            {
                "platePart1": "۱۲",
                "plateLetter": "ب",
                "platePart2": "345",
                "plateIranCode": "63",
            }
        )
        self.assertEqual(plk, {"plk1": "12", "plk2": "1", "plk3": "345", "plkSrl": "63"})

    def test_rejects_incomplete_plate(self):
        with self.assertRaises(ValueError):
            bb.map_plate_to_plk(
                {"platePart1": "1", "plateLetter": "ب", "platePart2": "345", "plateIranCode": "63"}
            )


class NormalizeOffersTests(unittest.TestCase):
    def test_keeps_all_companies(self):
        raw = {
            "status": "ok",
            "data": {
                "offers": [
                    {"company_name": f"شرکت {i}", "tariff": 1_000_000 + i, "base_tariff": 900_000}
                    for i in range(22)
                ]
            },
        }
        rows = bb.normalize_offers(raw, line="third_party")
        self.assertEqual(len(rows), 22)
        self.assertEqual(rows[0]["name"], "شرکت 0")
        self.assertEqual(rows[0]["thirdParty"], 1_000_000)
        self.assertIsNone(rows[0]["body"])


class ConfigTests(unittest.TestCase):
    def test_status_hides_secrets(self):
        with mock.patch.dict(
            os.environ,
            {
                "BIMEBAZAR_URL": "https://bimebazar.com/partners/",
                "BIMEBAZAR_USER": "secret-user",
                "BIMEBAZAR_PASS": "secret-pass",
            },
            clear=False,
        ):
            public = bb.bimebazar_status_public()
        dumped = json.dumps(public, ensure_ascii=False)
        self.assertTrue(public["configured"])
        self.assertNotIn("secret-user", dumped)
        self.assertNotIn("secret-pass", dumped)
        self.assertNotIn("_user", public)
        self.assertNotIn("_password", public)

    def test_quote_without_env_returns_503_payload(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            # Ensure keys absent
            for k in ("BIMEBAZAR_URL", "BIMEBAZAR_USER", "BIMEBAZAR_PASS"):
                os.environ.pop(k, None)
            # re-import config path uses os.environ at call time
            result = bb.quote_premium({"line": "third_party"})
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "bimebazar_env_missing")
        self.assertEqual(result["offers"], [])


class QuoteFlowMockTests(unittest.TestCase):
    def test_quote_returns_all_offers_on_happy_path(self):
        offers_payload = {
            "status": "ok",
            "data": {
                "offers": [
                    {
                        "id": f"o{i}",
                        "company_name": f"بیمه {i}",
                        "tariff": 2_000_000 + i,
                        "base_tariff": 1_800_000,
                        "discounts": [],
                        "solvency_level": 2,
                    }
                    for i in range(15)
                ]
            },
        }

        def fake_request(opener, url, **kwargs):
            if "password-login" in url:
                return {"ok": True, "status": 200, "result": {"success": True}}
            if "car-plate-inquiry" in url:
                return {
                    "ok": False,
                    "status": 400,
                    "result": {
                        "message_code": "sb_query_failed",
                        "data": {"sanhab_submit_response_status": "fail", "sb_id": "empty"},
                    },
                }
            if "offers" in url:
                return {"ok": True, "status": 200, "result": offers_payload}
            return {"ok": False, "status": 404, "result": {}}

        class FakeJar:
            def __iter__(self):
                cookie = mock.Mock()
                cookie.name = "auth-token"
                cookie.value = "tok_" + ("x" * 20)
                return iter([cookie])

        with mock.patch.dict(
            os.environ,
            {
                "BIMEBAZAR_URL": "https://bimebazar.com/partners/",
                "BIMEBAZAR_USER": "u",
                "BIMEBAZAR_PASS": "p",
            },
        ), mock.patch.object(bb, "_make_opener", return_value=(object(), FakeJar())), mock.patch.object(
            bb, "_request_json", side_effect=fake_request
        ):
            result = bb.quote_premium(
                {
                    "line": "third_party",
                    "nationalId": "0013542419",
                    "financialCover": 70_000_000,
                    "year": "1402",
                    "usage": "شخصی",
                    "vehicleType": "سواری",
                    "plate": {
                        "platePart1": "12",
                        "plateLetter": "ب",
                        "platePart2": "345",
                        "plateIranCode": "63",
                    },
                }
            )

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["mode"], "live")
        self.assertEqual(len(result["offers"]), 15)
        self.assertTrue(result.get("sanhabFailed"))
        dumped = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("tok_", dumped)
        self.assertNotIn('"p"', dumped)

    def test_sanhab_fail_with_empty_offers_is_persian(self):
        def fake_request(opener, url, **kwargs):
            if "password-login" in url:
                return {"ok": True, "status": 200, "result": {"success": True}}
            if "car-plate-inquiry" in url:
                return {
                    "ok": False,
                    "status": 400,
                    "result": {
                        "message_code": "sb_query_failed",
                        "data": {"sanhab_submit_response_status": "fail"},
                    },
                }
            if "offers" in url:
                return {"ok": True, "status": 200, "result": {"data": {"offers": []}}}
            return {"ok": False, "status": 404, "result": {}}

        class FakeJar:
            def __iter__(self):
                cookie = mock.Mock()
                cookie.name = "auth-token"
                cookie.value = "tok_abc"
                return iter([cookie])

        with mock.patch.dict(
            os.environ,
            {
                "BIMEBAZAR_URL": "https://bimebazar.com/partners/",
                "BIMEBAZAR_USER": "u",
                "BIMEBAZAR_PASS": "p",
            },
        ), mock.patch.object(bb, "_make_opener", return_value=(object(), FakeJar())), mock.patch.object(
            bb, "_request_json", side_effect=fake_request
        ):
            result = bb.quote_premium(
                {
                    "line": "third_party",
                    "nationalId": "0013542419",
                    "financialCover": 70_000_000,
                    "plate": {
                        "platePart1": "12",
                        "plateLetter": "ب",
                        "platePart2": "345",
                        "plateIranCode": "63",
                    },
                }
            )
        self.assertFalse(result["ok"])
        self.assertEqual(result["code"], "sanhab_failed")
        self.assertIn("سنهاب", result["error"])


if __name__ == "__main__":
    unittest.main()
