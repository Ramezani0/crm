"""Unit tests for M4 درمان گروهی — ceiling, franchise, waiting, tariff. No network/PG."""
from __future__ import annotations

import unittest

import group_health as gh


class CeilingTests(unittest.TestCase):
    def test_remaining_basic(self):
        self.assertEqual(gh.remaining_ceiling(100, 30), 70)

    def test_remaining_floor_zero(self):
        self.assertEqual(gh.remaining_ceiling(50, 80), 0)

    def test_api_ceiling(self):
        gh.reset_store_for_tests()
        r = gh.get_ceiling(query={"memberId": ["1"], "category": ["hospital"]})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["remainingRial"], 180_000_000)  # 200M - 20M used on M-001
        self.assertEqual(r["franchisePct"], 10.0)


class FranchiseDeductTests(unittest.TestCase):
    def test_franchise_10pct(self):
        # tariff 10M, basic 0, franchise 10% → net 9M; rem 50M → payout 9M
        calc = gh.compute_claim_payout(10_000_000, 0, 10, 50_000_000)
        self.assertEqual(calc["franchiseRial"], 1_000_000)
        self.assertEqual(calc["payoutRial"], 9_000_000)

    def test_capped_by_remaining(self):
        # after franchise 9M but remaining only 5M
        calc = gh.compute_claim_payout(10_000_000, 0, 10, 5_000_000)
        self.assertEqual(calc["payoutRial"], 5_000_000)

    def test_basic_share_then_franchise(self):
        # tariff 10M, basic 2M → net 8M; 10% fr = 800k → 7.2M
        calc = gh.compute_claim_payout(10_000_000, 2_000_000, 10, 100_000_000)
        self.assertEqual(calc["franchiseRial"], 800_000)
        self.assertEqual(calc["payoutRial"], 7_200_000)


class WaitingBlockTests(unittest.TestCase):
    def test_block_when_short(self):
        b = gh.check_waiting_block(5, 90)
        self.assertTrue(b["blocked"])
        self.assertEqual(b["remainingWaitDays"], 85)

    def test_pass_when_enough(self):
        b = gh.check_waiting_block(100, 90)
        self.assertFalse(b["blocked"])
        self.assertEqual(b["remainingWaitDays"], 0)

    def test_member_surgery_waiting(self):
        gh.reset_store_for_tests()
        # M-003 has daysEnrolled=5; surgery waiting=90
        w = gh.check_waiting_for_member(3, "surgery")
        self.assertTrue(w["ok"], w)
        self.assertTrue(w["blocked"])

    def test_referral_blocked_by_waiting(self):
        gh.reset_store_for_tests()
        r = gh.issue_referral({"memberId": 3, "type": "hospital"})
        self.assertFalse(r["ok"])
        self.assertTrue(r.get("blocked"))
        self.assertEqual(r.get("reason"), "waiting_period")


class TariffMatchTests(unittest.TestCase):
    def setUp(self):
        gh.reset_store_for_tests()

    def test_tariff_lookup(self):
        t = gh.get_tariff(query={"code": ["GH-D-310"]})
        self.assertTrue(t["ok"])
        self.assertEqual(t["item"]["approvedRial"], 1_800_000)

    def test_claim_matches_tariff_and_franchise(self):
        # dental GH-D-310 = 1.8M; franchise 10%; rem dental 15M
        c = gh.register_claim(
            {"memberId": 1, "kind": "dental", "amount": 2_000_000, "serviceCode": "GH-D-310"}
        )
        self.assertTrue(c["ok"], c)
        self.assertTrue(c["claim"]["tariffMatch"])
        # approved capped at invoice? approved=min(1.8M, 2M)=1.8M; fr=180k; payout=1.62M
        self.assertEqual(c["claim"]["approvedTariffRial"], 1_800_000)
        self.assertEqual(c["claim"]["franchiseRial"], 180_000)
        self.assertEqual(c["claim"]["payoutRial"], 1_620_000)

    def test_unknown_tariff_code(self):
        c = gh.register_claim(
            {"memberId": 1, "kind": "dental", "amount": 1_000_000, "serviceCode": "NOPE"}
        )
        self.assertFalse(c["ok"])


class ReferralAndAmendmentTests(unittest.TestCase):
    def setUp(self):
        gh.reset_store_for_tests()

    def test_referral_preview_ceiling_franchise(self):
        r = gh.issue_referral({"memberId": 1, "type": "paraclinic", "serviceCode": "GH-P-210"})
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["preview"]["franchisePct"], 10.0)
        self.assertGreater(r["preview"]["ceilingRemainingRial"], 0)

    def test_personnel_amendment_stub(self):
        a = gh.personnel_amendment(
            {
                "contractId": 1,
                "asOfJalali": "1404/07/01",
                "adds": [{"memberCode": "M-NEW", "fullName": "عضو جدید"}],
                "removes": ["M-002"],
            }
        )
        self.assertTrue(a["ok"], a)
        self.assertEqual(a["amendment"]["addsCount"], 1)
        self.assertEqual(a["amendment"]["removesCount"], 1)
        self.assertFalse(a["crmWipe"])
        members = gh.list_members(query={"contractId": ["1"]})
        codes_active = {m["memberCode"] for m in members["items"] if m["status"] == "active"}
        self.assertIn("M-NEW", codes_active)
        self.assertNotIn("M-002", codes_active)

    def test_csv_stub_parse(self):
        csv_text = "action,memberCode,fullName,nationalId\nadd,M-CSV,از CSV,111\n"
        a = gh.personnel_amendment({"contractId": 1, "asOfJalali": "1404/07/02", "csv": csv_text})
        self.assertTrue(a["ok"], a)
        self.assertEqual(a["amendment"]["addsCount"], 1)


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        gh.reset_store_for_tests()

    def test_meta(self):
        code, payload = gh.handle_request("GET", "/api/group-health/meta")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["productCode"], "group_health")
        self.assertTrue(payload["engExtension"])
        self.assertIsNone(payload["insuranceType"])

    def test_contracts(self):
        code, payload = gh.handle_request("GET", "/api/group-health/contracts")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(payload["count"], 1)

    def test_product_code_not_enum_pollution(self):
        meta = gh.meta()
        self.assertEqual(meta["productCode"], "group_health")
        # Explicit: not inventing insurance_type into locked enum
        self.assertIsNone(meta["insuranceType"])


if __name__ == "__main__":
    unittest.main()
