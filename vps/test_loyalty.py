"""Unit tests for M7 Loyalty — early pay points, coupon issue rule, leaderboard sort."""
from __future__ import annotations

import unittest

import loyalty


class EarlyPayPointsTests(unittest.TestCase):
    def setUp(self):
        loyalty.reset_store_for_tests()

    def test_days_early_positive(self):
        # paid 5 days before due (stub ordinal: same month)
        calc = loyalty.early_pay_points("1404/06/01", "1404/06/06")
        self.assertTrue(calc["eligible"])
        self.assertEqual(calc["daysEarly"], 5)
        self.assertGreaterEqual(calc["points"], loyalty.DEMO_RATES["early_pay_flat"])
        self.assertEqual(calc["points"], max(25, 5 * 10))

    def test_not_early(self):
        calc = loyalty.early_pay_points("1404/06/10", "1404/06/06")
        self.assertFalse(calc["eligible"])
        self.assertEqual(calc["points"], 0)

    def test_earn_early_pay_api(self):
        r = loyalty.earn(
            {
                "reason": "early_pay",
                "policyholderCode": "PH-E1",
                "paidDateJalali": "1404/05/01",
                "dueDateJalali": "1404/05/15",
                "installmentNo": 3,
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["entry"]["reason"], "early_pay")
        self.assertGreater(r["points"], 0)
        bal = loyalty.balance({"policyholderCode": ["PH-E1"]})
        self.assertEqual(bal["balance"], r["points"])

    def test_earn_rejects_late(self):
        r = loyalty.earn(
            {
                "reason": "early_pay",
                "policyholderCode": "PH-LATE",
                "paidDateJalali": "1404/05/20",
                "dueDateJalali": "1404/05/15",
            }
        )
        self.assertFalse(r["ok"])


class CouponIssueRuleTests(unittest.TestCase):
    def setUp(self):
        loyalty.reset_store_for_tests()

    def test_universal_life_issues_fire20(self):
        r = loyalty.issue_coupon(
            {
                "triggerPolicyType": "universal_life",
                "policyholderCode": "PH-C1",
                "policyNumber": "UL-999",
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["issued"])
        self.assertEqual(r["coupon"]["discountPercent"], 20)
        self.assertEqual(r["coupon"]["couponInsuranceType"], "fire")
        self.assertEqual(r["coupon"]["triggerPolicyType"], "universal_life")
        self.assertTrue(r["coupon"]["code"].startswith("FIRE20-"))

    def test_omid_retirement_also_triggers(self):
        r = loyalty.issue_coupon(
            {
                "triggerPolicyType": "omid_retirement",
                "policyholderCode": "PH-C2",
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["coupon"]["couponInsuranceType"], "fire")

    def test_unknown_trigger_rejected(self):
        # Do not invent insurance_type — third_party_auto is locked but not a coupon trigger
        r = loyalty.issue_coupon(
            {
                "triggerPolicyType": "third_party_auto",
                "policyholderCode": "PH-C3",
            }
        )
        self.assertFalse(r["ok"])
        self.assertIn("universal_life", r.get("error", ""))

    def test_list_coupons(self):
        loyalty.issue_coupon(
            {"triggerPolicyType": "universal_life", "policyholderCode": "PH-L1"}
        )
        lst = loyalty.list_coupons({"policyholderCode": ["PH-L1"]})
        self.assertTrue(lst["ok"])
        self.assertEqual(lst["count"], 1)


class LeaderboardSortTests(unittest.TestCase):
    def setUp(self):
        loyalty.reset_store_for_tests()

    def test_seed_sorted_desc(self):
        fest = loyalty.festival({"season": [loyalty.DEFAULT_SEASON]})
        self.assertTrue(fest["ok"])
        board = fest["leaderboard"]
        self.assertGreaterEqual(len(board), 2)
        points = [int(r["points"]) for r in board]
        self.assertEqual(points, sorted(points, reverse=True))
        self.assertEqual(board[0]["rank"], 1)
        for i, row in enumerate(board, start=1):
            self.assertEqual(row["rank"], i)

    def test_score_bump_changes_rank(self):
        # Add huge score to A-330 so it climbs
        r = loyalty.festival_score(
            {"agentCode": "A-330", "points": 500, "season": loyalty.DEFAULT_SEASON}
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["rank"], 1)
        fest = loyalty.festival({"season": [loyalty.DEFAULT_SEASON]})
        self.assertEqual(fest["leaderboard"][0]["agentCode"], "A-330")

    def test_new_agent(self):
        r = loyalty.festival_score(
            {
                "agentCode": "A-NEW",
                "points": 50,
                "agentName": "تازه",
                "season": loyalty.DEFAULT_SEASON,
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["created"])
        self.assertIsNotNone(r["rank"])


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        loyalty.reset_store_for_tests()

    def test_meta(self):
        code, payload = loyalty.handle_request("GET", "/api/loyalty/meta")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertIn("early_pay", payload["earnReasons"])
        self.assertIn("policyholder_code", payload["futureLinkKeys"])

    def test_earn_new_policy(self):
        code, r = loyalty.handle_request(
            "POST",
            "/api/loyalty/earn",
            body={"reason": "new_policy", "policyholderCode": "PH-API"},
        )
        self.assertEqual(code, 200)
        self.assertEqual(r["points"], loyalty.DEMO_RATES["new_policy"])

    def test_404(self):
        code, payload = loyalty.handle_request("GET", "/api/loyalty/nope")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
