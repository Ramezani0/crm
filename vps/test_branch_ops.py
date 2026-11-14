"""Unit tests for M8 Branch Ops — stock lifecycle, variance calc, check stub."""
from __future__ import annotations

import unittest

import branch_ops


class StockLifecycleTests(unittest.TestCase):
    def setUp(self):
        branch_ops.reset_store_for_tests()

    def test_receive_range(self):
        r = branch_ops.receive_stock(
            {
                "kind": "receipt",
                "serialFrom": "REC-5001",
                "serialTo": "REC-5003",
                "branchCode": "BR-01",
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["received"], 3)
        stock = branch_ops.list_stock({"kind": ["receipt"]})
        serials = {i["serial"] for i in stock["items"]}
        self.assertIn("REC-5001", serials)
        self.assertIn("REC-5003", serials)
        for item in stock["items"]:
            if item["serial"].startswith("REC-500"):
                self.assertEqual(item["status"], "received_from_branch")

    def test_issue_lifecycle(self):
        branch_ops.receive_stock(
            {"kind": "hologram", "serialFrom": "HOLO-9001", "serialTo": "HOLO-9001"}
        )
        r = branch_ops.issue_stock(
            {"serial": "HOLO-9001", "policyNumber": "POL-DEMO-9"}
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["issued"])
        self.assertEqual(r["item"]["status"], "issued")
        self.assertEqual(r["item"]["policyNumber"], "POL-DEMO-9")

    def test_void(self):
        branch_ops.receive_stock(
            {"kind": "policy_sheet", "serialFrom": "POL-8001", "serialTo": "POL-8001"}
        )
        r = branch_ops.void_stock({"serial": "POL-8001", "reason": "چاپ خراب DEMO"})
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["voided"])
        self.assertEqual(r["item"]["status"], "voided")
        # cannot issue voided
        bad = branch_ops.issue_stock({"serial": "POL-8001"})
        self.assertFalse(bad["ok"])

    def test_bad_kind(self):
        r = branch_ops.receive_stock(
            {"kind": "sticker", "serialFrom": "1", "serialTo": "2"}
        )
        self.assertFalse(r["ok"])


class VarianceCalcTests(unittest.TestCase):
    def setUp(self):
        branch_ops.reset_store_for_tests()

    def test_agency_higher(self):
        c = branch_ops.calc_variance(1_000_000, 900_000)
        self.assertTrue(c["ok"])
        self.assertEqual(c["variance"], 100_000)
        self.assertEqual(c["direction"], "agency_higher")

    def test_matched(self):
        c = branch_ops.calc_variance(500, 500)
        self.assertEqual(c["direction"], "matched")
        self.assertEqual(c["variance"], 0)

    def test_create_api(self):
        r = branch_ops.create_variance(
            {
                "agentCode": "A-99",
                "agencyAmount": 2_000_000,
                "branchAmount": 2_500_000,
                "note": "تست",
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["item"]["direction"], "branch_higher")
        self.assertEqual(r["item"]["variance"], -500_000)
        lst = branch_ops.list_variances({"agentCode": ["A-99"]})
        self.assertEqual(lst["count"], 1)


class CheckStubTests(unittest.TestCase):
    def setUp(self):
        branch_ops.reset_store_for_tests()

    def test_create_and_list(self):
        r = branch_ops.create_check(
            {
                "checkNumber": "CHK-T1",
                "amountRial": 1_200_000,
                "policyholderCode": "PH1",
                "dueJalali": "1404/08/01",
                "bankName": "ملت",
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["created"])
        self.assertEqual(r["item"]["status"], "received")
        lst = branch_ops.list_checks({"policyholderCode": ["PH1"]})
        self.assertEqual(lst["count"], 1)

    def test_rejects_zero_amount(self):
        r = branch_ops.create_check({"checkNumber": "CHK-Z", "amountRial": 0})
        self.assertFalse(r["ok"])


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        branch_ops.reset_store_for_tests()

    def test_meta(self):
        code, payload = branch_ops.handle_request("GET", "/api/branch-ops/meta")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertIn("receipt", payload["paperKinds"])

    def test_stock_get(self):
        code, payload = branch_ops.handle_request("GET", "/api/branch-ops/stock")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(payload["count"], 1)

    def test_404(self):
        code, payload = branch_ops.handle_request("GET", "/api/branch-ops/nope")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
