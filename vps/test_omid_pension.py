"""Unit tests for M3 امید بازنشستگی — compound 10%, age bounds, death paths. No network/PG."""
from __future__ import annotations

import unittest

import omid_pension as op


class CompoundTests(unittest.TestCase):
    def test_year0_unchanged(self):
        self.assertEqual(op.compound_monthly(1_000_000, 0), 1_000_000)

    def test_year1_10pct(self):
        self.assertEqual(op.compound_monthly(1_000_000, 1), 1_100_000)

    def test_year2_compound(self):
        # 1e6 * 1.1^2 = 1_210_000
        self.assertEqual(op.compound_monthly(1_000_000, 2), 1_210_000)

    def test_year9_guaranteed_end(self):
        # 1e6 * 1.1^9
        expected = round(1_000_000 * (1.10**9))
        self.assertEqual(op.compound_monthly(1_000_000, 9), expected)


class AgeBoundsTests(unittest.TestCase):
    def test_valid_50_61(self):
        for a in (50, 55, 61):
            ok, age, err = op.validate_retirement_age(a)
            self.assertTrue(ok, err)
            self.assertEqual(age, a)

    def test_rejects_below(self):
        ok, _, err = op.validate_retirement_age(49)
        self.assertFalse(ok)
        self.assertIn("50", err or "")

    def test_rejects_above(self):
        ok, _, err = op.validate_retirement_age(62)
        self.assertFalse(ok)

    def test_simulate_rejects_bad_age(self):
        r = op.simulate({"retirementAge": 45, "accumulationYears": 10})
        self.assertFalse(r["ok"])


class DeathPathTests(unittest.TestCase):
    def setUp(self):
        op.reset_store_for_tests()

    def test_death_guaranteed_to_beneficiary(self):
        c = op.create_plan(
            {
                "retirementAge": 55,
                "accumulationYears": 12,
                "accumulationRial": 240_000_000,
                "policyNumber": "P-G",
                "nationalId": "123",
            }
        )
        self.assertTrue(c["ok"], c)
        pid = c["plan"]["id"]
        t = op.transition({"planId": pid})
        self.assertTrue(t["ok"], t)
        self.assertEqual(t["plan"]["phase"], "guaranteed_10y")
        self.assertTrue(t["loanBlocked"])
        d = op.record_death({"planId": pid})
        self.assertTrue(d["ok"], d)
        self.assertEqual(d["action"], "beneficiary_remaining")
        self.assertGreater(d["remainingScheduleCount"], 0)
        self.assertFalse(d["plan"]["alive"])
        sched = op.get_schedule(pid)
        bens = [s for s in sched["items"] if s["status"] == "beneficiary"]
        self.assertEqual(len(bens), sched["count"])

    def test_death_lifetime_stops(self):
        c = op.create_plan({"retirementAge": 60, "accumulationYears": 10, "accumulationRial": 100_000_000})
        pid = c["plan"]["id"]
        op.transition({"planId": pid})
        # Force lifetime phase
        with op._STORE_LOCK:
            plan = op._find_plan(pid)
            plan["phase"] = "lifetime"
            plan["currentYearIndex"] = 10
        d = op.record_death({"planId": pid})
        self.assertTrue(d["ok"])
        self.assertEqual(d["action"], "lifetime_stop")
        self.assertTrue(d["stopped"])


class PolAndPayoutTests(unittest.TestCase):
    def setUp(self):
        op.reset_store_for_tests()

    def test_payout_blocked_without_pol(self):
        c = op.create_plan({"retirementAge": 55, "accumulationYears": 10})
        pid = c["plan"]["id"]
        op.transition({"planId": pid})
        prev = op.payout_preview({"planId": pid, "yearIndex": 0})
        self.assertFalse(prev["ok"])
        self.assertTrue(prev.get("blocked"))

    def test_payout_after_pol_confirm(self):
        c = op.create_plan({"retirementAge": 55, "accumulationYears": 10, "accumulationRial": 240_000_000})
        pid = c["plan"]["id"]
        initial = c["plan"]["initialMonthlyRial"]
        op.transition({"planId": pid})
        pol = op.post_proof_of_life({"planId": pid, "status": "confirmed"})
        self.assertTrue(pol["ok"])
        prev = op.payout_preview({"planId": pid, "yearIndex": 1})
        self.assertTrue(prev["ok"], prev)
        self.assertEqual(prev["amountRial"], op.compound_monthly(initial, 1))

    def test_life_meta_and_jalali(self):
        c = op.create_plan(
            {
                "retirementAge": 52,
                "accumulationYears": 8,
                "policyNumber": "OM-99",
                "nationalId": "0011223344",
                "issue_date_jalali": "1403/06/01",
                "start_date_jalali": "1403/06/01",
                "end_date_jalali": "1423/05/31",
                "life_policy_meta": {
                    "first_year_end_reserve": 300_000_000,
                    "premium_escalate_pct": 10,
                    "sum_insured_escalate_pct": 5,
                },
                "پرونده_365": {"نمایندگی": "3045", "بازاریاب": "نمونه"},
            }
        )
        self.assertTrue(c["ok"], c)
        p = c["plan"]
        self.assertEqual(p["insuranceType"], "omid_retirement")
        self.assertEqual(p["issueDateJalali"], "1403/06/01")
        self.assertEqual(p["lifePolicyMeta"]["first_year_end_reserve"], 300_000_000.0)
        self.assertEqual(p["extra"]["پرونده_365"]["نمایندگی"], "3045")
        # accumulation seeded from first_year_end_reserve
        self.assertEqual(p["accumulationRial"], 300_000_000)


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        op.reset_store_for_tests()

    def test_simulate_get(self):
        code, payload = op.handle_request(
            "GET",
            "/api/omid-pension/simulate",
            query={"retirementAge": ["55"], "accumulationYears": ["15"], "accumulationRial": ["240000000"]},
        )
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["demoStub"])
        self.assertEqual(payload["yearsPreview"][1]["monthlyRial"], op.compound_monthly(payload["initialMonthlyRial"], 1))

    def test_meta(self):
        code, payload = op.handle_request("GET", "/api/omid-pension/meta")
        self.assertEqual(code, 200)
        self.assertEqual(payload["insuranceType"], "omid_retirement")
        self.assertIn("omid_retirement", payload["importAlign"]["insuranceTypeEnumIncludes"])


if __name__ == "__main__":
    unittest.main()
