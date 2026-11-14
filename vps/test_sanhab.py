"""Unit tests for M5 سنهاب — ceiling over-limit, unique code format, queue→export. No network/PG."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

import sanhab as sh


class CeilingOverLimitTests(unittest.TestCase):
    def test_under_limit(self):
        c = sh.check_death_over_limit(10_000_000_000, 5_000_000_000, 50_000_000_000)
        self.assertFalse(c["overLimit"])
        self.assertEqual(c["totalAfterRial"], 15_000_000_000)
        self.assertEqual(c["headroomRial"], 40_000_000_000)
        self.assertEqual(c["excessRial"], 0)

    def test_over_limit(self):
        c = sh.check_death_over_limit(48_000_000_000, 5_000_000_000, 50_000_000_000)
        self.assertTrue(c["overLimit"])
        self.assertEqual(c["excessRial"], 3_000_000_000)

    def test_exact_ceiling_not_over(self):
        c = sh.check_death_over_limit(40_000_000_000, 10_000_000_000, 50_000_000_000)
        self.assertFalse(c["overLimit"])

    def test_api_death_inquiry_flags_over(self):
        sh.reset_store_for_tests()
        # seeded 0076543210 = 48B; propose 5B → over 50B
        r = sh.death_inquiry({"nationalId": "0076543210", "proposedCapital": 5_000_000_000})
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["overLimit"])
        self.assertTrue(r["inquiry"]["overLimit"])

    def test_manual_override(self):
        sh.reset_store_for_tests()
        r = sh.death_inquiry(
            {
                "nationalId": "0011111111",
                "proposedCapital": 1_000_000,
                "manualKnownSum": 49_999_000_000,
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["inquiry"]["manualOverride"])
        self.assertFalse(r["overLimit"])  # 49.999B + 1M = 50B exact


class UniqueCodeFormatTests(unittest.TestCase):
    def test_format_regex(self):
        code = sh.generate_unique_code(seed="policy-ABC")
        self.assertTrue(sh.is_valid_unique_code(code), code)
        self.assertRegex(code, sh.UNIQUE_CODE_RE)

    def test_deterministic_for_seed(self):
        a = sh.generate_unique_code(seed="same-seed-xyz")
        b = sh.generate_unique_code(seed="same-seed-xyz")
        self.assertEqual(a, b)

    def test_assign_and_get(self):
        sh.reset_store_for_tests()
        a = sh.assign_unique_code(
            {"policyNumber": "TP-1404-001", "computerCode": "BN-99", "plate": "12ب34567"}
        )
        self.assertTrue(a["ok"], a)
        self.assertTrue(a["assigned"])
        self.assertTrue(sh.is_valid_unique_code(a["uniqueCode"]))
        g = sh.get_unique_code(query={"policyNumber": ["TP-1404-001"]})
        self.assertTrue(g["found"])
        self.assertEqual(g["uniqueCode"], a["uniqueCode"])

    def test_idempotent_assign(self):
        sh.reset_store_for_tests()
        a1 = sh.assign_unique_code({"policyNumber": "TP-1"})
        a2 = sh.assign_unique_code({"policyNumber": "TP-1"})
        self.assertTrue(a1["assigned"])
        self.assertFalse(a2["assigned"])
        self.assertEqual(a1["uniqueCode"], a2["uniqueCode"])


class QueueExportTests(unittest.TestCase):
    def setUp(self):
        sh.reset_store_for_tests()
        self._tmpdir = tempfile.TemporaryDirectory()
        sh._EXPORT_DIR = Path(self._tmpdir.name)

    def tearDown(self):
        self._tmpdir.cleanup()

    def test_enqueue_list_export(self):
        e1 = sh.enqueue_export(
            {"kind": "issuance", "payload": {"policyNumber": "P-1", "premium": 1000}}
        )
        self.assertTrue(e1["ok"], e1)
        e2 = sh.enqueue_export(
            {"kind": "endorsement", "payload": {"policyNumber": "P-1", "endorsementNo": "H-2"}}
        )
        self.assertTrue(e2["ok"], e2)
        e3 = sh.enqueue_export(
            {"kind": "financial_tx", "payload": {"policyNumber": "P-2", "amount": 500}}
        )
        self.assertTrue(e3["ok"], e3)

        q = sh.list_export_queue()
        self.assertEqual(q["queuedCount"], 3)

        run = sh.run_export({})
        self.assertTrue(run["ok"], run)
        self.assertEqual(run["exported"], 3)
        self.assertIsNotNone(run["batch"])
        json_path = Path(run["batch"]["jsonPath"])
        csv_path = Path(run["batch"]["csvPath"])
        self.assertTrue(json_path.exists())
        self.assertTrue(csv_path.exists())
        data = json.loads(json_path.read_text(encoding="utf-8"))
        self.assertEqual(data["count"], 3)
        self.assertTrue(data["demoStub"])

        q2 = sh.list_export_queue(query={"status": ["queued"]})
        self.assertEqual(q2["count"], 0)
        q3 = sh.list_export_queue(query={"status": ["exported"]})
        self.assertEqual(q3["count"], 3)

    def test_bad_kind_rejected(self):
        r = sh.enqueue_export({"kind": "nope", "payload": {}})
        self.assertFalse(r["ok"])


class VehicleStubTests(unittest.TestCase):
    def test_vehicle_inquiry_fields(self):
        sh.reset_store_for_tests()
        r = sh.vehicle_inquiry({"demo": True, "plate": "21الف12345", "vin": "IRVIN0001"})
        self.assertTrue(r["ok"], r)
        inv = r["inquiry"]
        self.assertIn("thirdPartyNcdPct", inv)
        self.assertIn("bodyNcdPct", inv)
        self.assertIn("accidentHistoryCount", inv)
        self.assertGreaterEqual(inv["thirdPartyNcdPct"], 0)
        self.assertLessEqual(inv["thirdPartyNcdPct"], 70)

    def test_requires_plate_or_vin(self):
        sh.reset_store_for_tests()
        r = sh.vehicle_inquiry({"demo": True})
        self.assertFalse(r["ok"])


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        sh.reset_store_for_tests()

    def test_meta(self):
        code, payload = sh.handle_request("GET", "/api/sanhab/meta")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        # Vehicle inquiry defaults to live BimeBazar → noNetwork False
        self.assertFalse(payload["noNetwork"])
        self.assertEqual(payload["vehicleInquiry"]["liveSource"], "BIMEBAZAR_PARTNER")

    def test_ceiling_get_put(self):
        code, payload = sh.handle_request("GET", "/api/sanhab/death-ceiling")
        self.assertEqual(code, 200)
        code, payload = sh.handle_request(
            "PUT", "/api/sanhab/death-ceiling", {"ceilingRial": 60_000_000_000}
        )
        self.assertEqual(code, 200)
        self.assertEqual(payload["config"]["ceilingRial"], 60_000_000_000)


if __name__ == "__main__":
    unittest.main()


class VehicleLiveAdapterTests(unittest.TestCase):
    def setUp(self):
        sh.reset_store_for_tests()

    def test_live_requires_plate_and_nid(self):
        r = sh.vehicle_inquiry({})
        self.assertFalse(r["ok"])
        self.assertEqual(r["code"], "invalid_plate")
        self.assertEqual(r["source"], "BIMEBAZAR_PARTNER")
        self.assertIn("بیمه‌بازار", r["label"])
        self.assertNotIn("سنهاب رسمی", r["label"])

    def test_live_invalid_nid(self):
        r = sh.vehicle_inquiry({
            "plate": {
                "platePart1": "12",
                "plateLetter": "ب",
                "platePart2": "345",
                "plateIranCode": "11",
            },
            "nationalId": "123",
        })
        self.assertFalse(r["ok"])
        self.assertEqual(r["code"], "invalid_national_id")

    def test_live_missing_env_no_silent_demo(self):
        import os
        # Ensure unset for this process
        for k in ("BIMEBAZAR_URL", "BIMEBAZAR_USER", "BIMEBAZAR_PASS"):
            os.environ.pop(k, None)
        r = sh.vehicle_inquiry({
            "plate": {
                "platePart1": "12",
                "plateLetter": "ب",
                "platePart2": "345",
                "plateIranCode": "11",
            },
            "nationalId": "0013542419",
        })
        self.assertFalse(r["ok"])
        self.assertEqual(r["code"], "bimebazar_env_missing")
        self.assertFalse(r.get("demoStub"))
        self.assertEqual(r["source"], "BIMEBAZAR_PARTNER")
        # No PII persisted
        self.assertEqual(sh._INQUIRIES, [])

    def test_extract_only_present_fields(self):
        from sanhab_vehicle_provider import extract_partner_vehicle_fields
        empty = extract_partner_vehicle_fields({})
        self.assertIsNone(empty["owner"])
        self.assertIsNone(empty["policy"])
        self.assertEqual(empty["availableFields"], [])
        partial = extract_partner_vehicle_fields({
            "sb_id": "SB-1",
            "sanhab_submit_response_status": "success",
            "company_name": "ایران",
            # address intentionally absent — must not invent
        })
        self.assertIsNone(partial["owner"])
        self.assertEqual(partial["policy"]["insurerCompany"], "ایران")
        self.assertNotIn("address", (partial["owner"] or {}))
        self.assertIn("partner.sbId", partial["availableFields"])

    def test_meta_honest_label(self):
        code, payload = sh.handle_request("GET", "/api/sanhab/meta")
        self.assertEqual(code, 200)
        vi = payload["vehicleInquiry"]
        self.assertEqual(vi["label"], "استعلام از طریق بیمه‌بازار")
        self.assertFalse(vi["officialSanhab"])
        self.assertFalse(vi["persistsPii"])
