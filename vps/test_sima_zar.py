"""Unit tests for M2 سیما زر fee math + mg conversion — no network, no Postgres."""
from __future__ import annotations

import os
import unittest
from decimal import Decimal
from unittest import mock

import sima_zar as sz


class MgConversionTests(unittest.TestCase):
    def test_grams_to_mg(self):
        self.assertEqual(sz.grams_to_milligrams(1), Decimal("1000.000"))
        self.assertEqual(sz.grams_to_milligrams("0.5"), Decimal("500.000"))
        self.assertEqual(sz.grams_to_milligrams("1.234567"), Decimal("1234.567"))

    def test_mg_to_grams(self):
        self.assertEqual(sz.milligrams_to_grams(1000), Decimal("1.000000"))
        self.assertEqual(sz.milligrams_to_grams(250), Decimal("0.250000"))


class FeeMathTests(unittest.TestCase):
    def setUp(self):
        os.environ["SIMA_ZAR_RATE_SOURCE"] = "manual"
        sz.reset_store_for_tests()
        sz.put_rate({"rialPerGram": 35_000_000, "symbol": "GOB1CD0001", "source": "DEMO_STUB"})

    def tearDown(self):
        os.environ.pop("SIMA_ZAR_RATE_SOURCE", None)

    def test_entry_fee_1pct_one_gram(self):
        # 1g @ 35e6 → asset 35e6, fee 1% = 350_000, total pay 35_350_000
        r = sz.compute_fees(grams=1, side="entry")
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["milligrams"], 1000.0)
        self.assertEqual(r["assetValueRial"], 35_000_000)
        self.assertEqual(r["feePct"], 1.0)
        self.assertEqual(r["feeRial"], 350_000)
        self.assertEqual(r["totalRial"], 35_350_000)
        self.assertEqual(r["feeKind"], "fee_entry")

    def test_exit_fee_2pct_one_gram(self):
        r = sz.compute_fees(grams=1, side="exit")
        self.assertTrue(r["ok"])
        self.assertEqual(r["feePct"], 2.0)
        self.assertEqual(r["feeRial"], 700_000)
        self.assertEqual(r["netRial"], 34_300_000)
        self.assertEqual(r["feeKind"], "fee_exit")

    def test_fee_from_milligrams(self):
        r = sz.compute_fees(milligrams=500, side="entry", rate_rial_per_gram=10_000_000)
        # 0.5g * 10e6 = 5e6; fee 1% = 50_000
        self.assertEqual(r["assetValueRial"], 5_000_000)
        self.assertEqual(r["feeRial"], 50_000)
        self.assertEqual(r["totalRial"], 5_050_000)

    def test_rejects_zero(self):
        bad = sz.compute_fees(grams=0, side="entry")
        self.assertFalse(bad["ok"])


class DepositRedeemTests(unittest.TestCase):
    def setUp(self):
        os.environ["SIMA_ZAR_RATE_SOURCE"] = "manual"
        sz.reset_store_for_tests()
        sz.put_rate({"rialPerGram": 10_000_000, "symbol": "GOB1CD0001"})

    def tearDown(self):
        os.environ.pop("SIMA_ZAR_RATE_SOURCE", None)

    def test_deposit_and_list(self):
        d = sz.deposit({"customerId": 42, "grams": 2, "customerLabel": "نمونه"})
        self.assertTrue(d["ok"], d)
        self.assertEqual(d["position"]["milligrams"], 2000.0)
        self.assertTrue(d["loanBlocked"])
        self.assertEqual(d["deposit"]["feeEntryRial"], 200_000)  # 2g * 10e6 * 1%
        listed = sz.list_positions(customer_id=42)
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["totalGrams"], 2.0)

    def test_redeem_partial(self):
        d = sz.deposit({"grams": 1})
        pid = d["position"]["id"]
        r = sz.redeem({"positionId": pid, "milligrams": 250})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["position"]["milligrams"], 750.0)
        self.assertEqual(r["redeem"]["feeExitPct"], 2.0)
        # 0.25g * 10e6 = 2_500_000; fee 2% = 50_000; net 2_450_000
        self.assertEqual(r["redeem"]["feeExitRial"], 50_000)
        self.assertEqual(r["redeem"]["netPayoutRial"], 2_450_000)

    def test_redeem_overdraw(self):
        d = sz.deposit({"milligrams": 100})
        r = sz.redeem({"positionId": d["position"]["id"], "milligrams": 200})
        self.assertFalse(r["ok"])

    def test_loan_always_blocked(self):
        result = sz.loan_check({"positionId": 1})
        self.assertFalse(result["allowed"])
        self.assertTrue(result["loanBlocked"])
        self.assertIn("وام", result["reason"])


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        os.environ["SIMA_ZAR_RATE_SOURCE"] = "manual"
        sz.reset_store_for_tests()
        sz.put_rate({"rialPerGram": 35_000_000})

    def tearDown(self):
        os.environ.pop("SIMA_ZAR_RATE_SOURCE", None)

    def test_get_rate(self):
        code, payload = sz.handle_request("GET", "/api/sima-zar/rate")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["symbol"], "GOB1CD0001")
        self.assertEqual(payload["source"], "MANUAL")
        self.assertFalse(payload["demoStub"])
        self.assertFalse(payload["live"])
        self.assertIn("rateRialPerGram", payload)

    def test_put_rate(self):
        code, payload = sz.handle_request(
            "PUT", "/api/sima-zar/rate", {"rialPerGram": 40_000_000, "symbol": "GOB1CD0001"}
        )
        self.assertEqual(code, 200)
        self.assertEqual(payload["rialPerGram"], 40_000_000.0)

    def test_preview_get(self):
        code, payload = sz.handle_request(
            "GET",
            "/api/sima-zar/preview",
            query={"grams": ["1"], "side": ["entry"]},
        )
        self.assertEqual(code, 200)
        self.assertEqual(payload["feeRial"], 350_000)

    def test_loan_check_403(self):
        code, payload = sz.handle_request("POST", "/api/sima-zar/loan-check", {"positionId": 9})
        self.assertEqual(code, 403)
        self.assertFalse(payload["allowed"])
        self.assertEqual(payload["reason"], "وام روی این طرح مجاز نیست")

    def test_deposit_redeem_flow(self):
        code, d = sz.handle_request(
            "POST", "/api/sima-zar/deposit", {"customerId": 1, "milligrams": 1000}
        )
        self.assertEqual(code, 200)
        pid = d["position"]["id"]
        code2, r = sz.handle_request(
            "POST", "/api/sima-zar/redeem", {"positionId": pid, "milligrams": 1000}
        )
        self.assertEqual(code2, 200)
        self.assertEqual(r["position"]["milligrams"], 0.0)
        self.assertEqual(r["position"]["status"], "closed")


class TgjuParseAndLiveTests(unittest.TestCase):
    def setUp(self):
        os.environ["SIMA_ZAR_RATE_SOURCE"] = "tgju"
        os.environ.pop("SIMA_ZAR_RATE_RIAL_PER_GRAM", None)
        sz.reset_store_for_tests()

    def tearDown(self):
        for k in (
            "SIMA_ZAR_RATE_SOURCE",
            "SIMA_ZAR_RATE_URL",
            "SIMA_ZAR_RATE_KEY",
            "SIMA_ZAR_RATE_CACHE_SEC",
        ):
            os.environ.pop(k, None)

    def test_default_key_is_ime_cert(self):
        self.assertEqual(sz.DEFAULT_TGJU_KEY, "ime_certificate_gold_bars")
        self.assertEqual(sz._env_tgju_key(), "ime_certificate_gold_bars")
        self.assertEqual(
            sz._rial_per_gram_from_node("ime_certificate_gold_bars", Decimal("31638990")),
            Decimal("316389900"),
        )
        self.assertEqual(
            sz._rial_per_gram_from_node("geram24", Decimal("316875000")),
            Decimal("316875000"),
        )

    def test_parse_rial_price(self):
        self.assertEqual(sz._parse_rial_price("316,875,000"), Decimal("316875000"))
        self.assertEqual(sz._parse_rial_price("۳۱۶٬۸۷۵٬۰۰۰".replace("٬", ",")), Decimal("316875000"))
        self.assertIsNone(sz._parse_rial_price(""))
        self.assertIsNone(sz._parse_rial_price("0"))

    def test_live_success_ime_cert_times_ten(self):
        # IME cert = 0.1g → p * 10 = rial/gram
        sample = {
            "current": {
                "ime_certificate_gold_bars": {
                    "p": "31,638,990",
                    "h": "31,800,000",
                    "l": "31,500,000",
                    "ts": "2026-09-24 00:00:00",
                    "t": "۲ مهر",
                },
                "geram24": {
                    "p": "316,875,000",
                    "ts": "2026-09-24 00:00:00",
                },
            }
        }
        fake_raw = __import__("json").dumps(sample).encode()

        class FakeResp:
            def read(self):
                return fake_raw

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with mock.patch("sima_zar.urllib.request.urlopen", return_value=FakeResp()):
            code, payload = sz.handle_request("GET", "/api/sima-zar/rate")
        self.assertEqual(code, 200)
        self.assertTrue(payload["live"])
        self.assertTrue(payload["configured"])
        self.assertFalse(payload["demoStub"])
        self.assertEqual(payload["source"], "tgju_ime")
        self.assertEqual(payload["tgjuSubSource"], "ime_certificate_gold_bars")
        self.assertEqual(payload["rateRialPerGram"], 316_389_900.0)  # 31638990 * 10
        self.assertFalse(payload.get("fallback"))
        self.assertIn("بورس کالا", payload["sourceLabel"])
        self.assertIsNone(payload["error"])

    def test_live_fallback_geram24_when_ime_missing(self):
        sample = {
            "current": {
                "geram24": {
                    "p": "316,875,000",
                    "h": "319,193,000",
                    "l": "312,861,000",
                    "ts": "2026-09-23 00:00:00",
                    "t": "۱ مهر",
                }
            }
        }
        fake_raw = __import__("json").dumps(sample).encode()

        class FakeResp:
            def read(self):
                return fake_raw

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with mock.patch("sima_zar.urllib.request.urlopen", return_value=FakeResp()):
            code, payload = sz.handle_request("GET", "/api/sima-zar/rate")
        self.assertEqual(code, 200)
        self.assertTrue(payload["live"])
        self.assertEqual(payload["source"], "tgju")
        self.assertEqual(payload["tgjuSubSource"], "geram24")
        self.assertEqual(payload["rateRialPerGram"], 316_875_000.0)  # no ×10
        self.assertTrue(payload.get("fallback"))
        self.assertIn("بازار", payload["sourceLabel"])
        self.assertIn("پشتیبان", payload["sourceLabel"])

    def test_live_fail_keeps_manual_no_silent_stub(self):
        sz.put_rate({"rialPerGram": 42_000_000, "source": "MANUAL", "notes": "user"})
        with mock.patch(
            "sima_zar.urllib.request.urlopen",
            side_effect=OSError("network down"),
        ):
            # force refresh to bypass empty cache
            code, payload = sz.handle_request(
                "GET", "/api/sima-zar/rate", query={"refresh": ["1"]}
            )
        self.assertEqual(code, 200)
        self.assertFalse(payload["live"])
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["rialPerGram"], 42_000_000.0)
        self.assertEqual(payload["source"], "MANUAL")
        self.assertFalse(payload["demoStub"])
        self.assertIn("tgju", (payload.get("error") or "").lower())
        # Must NOT overwrite with DEMO_STUB primary
        self.assertNotEqual(payload["source"], "DEMO_STUB")


if __name__ == "__main__":
    unittest.main()
