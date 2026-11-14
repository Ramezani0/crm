"""Unit tests for M6 DMS — barcode unique, hash stable, OCR field map, sign attaches hash."""
from __future__ import annotations

import hashlib
import json
import unittest

import dms


class BarcodeUniqueTests(unittest.TestCase):
    def setUp(self):
        dms.reset_store_for_tests()

    def test_format_regex(self):
        code = dms.generate_barcode("3045", "A1", "03", "Z12", seed="t1")
        self.assertTrue(dms.is_valid_barcode(code), code)
        self.assertRegex(code, dms.BARCODE_RE)

    def test_assign_unique_per_dossier(self):
        a = dms.assign_archive(
            {"dossierKey": "D-1", "branch": "3045", "shelf": "A1", "row": "01", "binder": "Z1"}
        )
        self.assertTrue(a["ok"], a)
        self.assertTrue(a["assigned"])
        self.assertTrue(dms.is_valid_barcode(a["barcode"]))

        b = dms.assign_archive(
            {"dossierKey": "D-2", "branch": "3045", "shelf": "A1", "row": "01", "binder": "Z1"}
        )
        self.assertTrue(b["ok"], b)
        # Same address different dossier → different hex seed → different barcode
        self.assertNotEqual(a["barcode"], b["barcode"])

    def test_lookup_by_barcode_and_dossier(self):
        a = dms.assign_archive(
            {"dossierKey": "D-L1", "branch": "B1", "shelf": "S1", "row": "R1", "binder": "Z9"}
        )
        by_bc = dms.lookup_archive(query={"barcode": [a["barcode"]]})
        self.assertTrue(by_bc["found"])
        self.assertEqual(by_bc["location"]["dossierKey"], "D-L1")
        by_dk = dms.lookup_archive(query={"dossierKey": ["D-L1"]})
        self.assertTrue(by_dk["found"])
        self.assertEqual(by_dk["location"]["barcode"], a["barcode"])

    def test_idempotent_reassign(self):
        a1 = dms.assign_archive(
            {"dossierKey": "D-same", "branch": "1", "shelf": "2", "row": "3", "binder": "4"}
        )
        a2 = dms.assign_archive(
            {"dossierKey": "D-same", "branch": "1", "shelf": "2", "row": "3", "binder": "4"}
        )
        self.assertTrue(a1["assigned"])
        self.assertFalse(a2["assigned"])
        self.assertEqual(a1["barcode"], a2["barcode"])


class HashStableTests(unittest.TestCase):
    def setUp(self):
        dms.reset_store_for_tests()

    def test_sha256_stable(self):
        payload = {"kind": "proposal", "dossierKey": "X", "title": "t", "fields": {"a": 1}}
        h1 = dms.sha256_hex(payload)
        h2 = dms.sha256_hex(payload)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)
        # Manual verify
        canon = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        expect = hashlib.sha256(canon.encode("utf-8")).hexdigest()
        self.assertEqual(h1, expect)

    def test_create_document_includes_hash(self):
        r = dms.create_document(
            {
                "dossierKey": "D-H1",
                "kind": "proposal",
                "title": "فرم پیشنهاد",
                "meta": {"plan": "omid"},
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["hashAlgo"], "sha256")
        self.assertEqual(len(r["documentHash"]), 64)
        g = dms.get_document(r["document"]["id"])
        self.assertTrue(g["found"])
        self.assertEqual(g["documentHash"], r["documentHash"])

    def test_same_canonical_same_hash(self):
        body = {
            "dossierKey": "D-H2",
            "kind": "proposal",
            "title": "same",
            "meta": {"x": 1},
        }
        r1 = dms.create_document(body)
        # Recompute from same canonical shape
        canon = {
            "kind": "proposal",
            "dossierKey": "D-H2",
            "title": "same",
            "fields": {"x": 1},
            "policyNumber": None,
            "policyholderCode": None,
            "nationalId": None,
        }
        self.assertEqual(dms.sha256_hex(canon), r1["documentHash"])


class OcrFieldMapTests(unittest.TestCase):
    def setUp(self):
        dms.reset_store_for_tests()

    def test_national_id_card_defaults(self):
        fields = dms.map_ocr_fields("national_id_card")
        self.assertIn("name", fields)
        self.assertIn("nationalId", fields)
        self.assertEqual(len(fields["nationalId"]), 10)

    def test_stub_text_override(self):
        fields = dms.map_ocr_fields(
            "national_id_card", "name:سارا محمدی|nationalId:0011223344"
        )
        self.assertEqual(fields["name"], "سارا محمدی")
        self.assertEqual(fields["nationalId"], "0011223344")

    def test_ocr_job_api(self):
        r = dms.create_ocr_job(
            {"docType": "birth_certificate", "stubText": "نام:کاوه|کدملی:0099009900"}
        )
        self.assertTrue(r["ok"], r)
        self.assertFalse(r["realMl"])
        self.assertEqual(r["job"]["status"], "done")
        self.assertIn("name", r["mappedFields"])
        g = dms.get_ocr_job(r["job"]["id"])
        self.assertTrue(g["found"])
        self.assertEqual(g["mappedFields"]["nationalId"], "0099009900")

    def test_bad_doc_type(self):
        r = dms.create_ocr_job({"docType": "passport"})
        self.assertFalse(r["ok"])


class SignAttachesHashTests(unittest.TestCase):
    def setUp(self):
        dms.reset_store_for_tests()

    def test_touch_sign_attaches_document_hash(self):
        doc = dms.create_document(
            {"dossierKey": "D-S1", "kind": "proposal", "meta": {"plan": "omid"}}
        )
        digest = doc["documentHash"]
        sig = dms.sign_document(
            {
                "documentId": doc["document"]["id"],
                "method": "touch",
                "payloadStub": [{"x": 1, "y": 2}, {"x": 3, "y": 4}],
            }
        )
        self.assertTrue(sig["ok"], sig)
        self.assertFalse(sig["realBiometrics"])
        self.assertEqual(sig["documentHash"], digest)
        self.assertEqual(sig["signature"]["documentHash"], digest)
        self.assertTrue(sig["document"]["signed"])

        g = dms.get_document(doc["document"]["id"])
        self.assertTrue(g["document"]["signed"])
        self.assertIsNotNone(g["document"]["signature"])
        self.assertEqual(g["document"]["signature"]["documentHash"], digest)

    def test_fingerprint_stub(self):
        doc = dms.create_document({"dossierKey": "D-S2", "kind": "proposal"})
        sig = dms.sign_document(
            {
                "documentId": doc["document"]["id"],
                "method": "fingerprint",
                "payloadStub": {"templateId": "FP-DEMO-001", "score": 0.91},
            }
        )
        self.assertTrue(sig["ok"], sig)
        self.assertEqual(sig["signature"]["method"], "fingerprint")
        self.assertFalse(sig["signature"]["realBiometrics"])
        self.assertEqual(sig["signature"]["documentHash"], doc["documentHash"])

    def test_bad_method(self):
        doc = dms.create_document({"dossierKey": "D-S3", "kind": "other"})
        r = dms.sign_document(
            {"documentId": doc["document"]["id"], "method": "ink", "payloadStub": "x"}
        )
        self.assertFalse(r["ok"])


class HandleRequestTests(unittest.TestCase):
    def setUp(self):
        dms.reset_store_for_tests()

    def test_meta(self):
        code, payload = dms.handle_request("GET", "/api/dms/meta")
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["noRealBiometrics"])
        self.assertTrue(payload["noRealMl"])
        self.assertIn("policy_number", payload["futureLinkKeys"])

    def test_archive_flow(self):
        code, a = dms.handle_request(
            "POST",
            "/api/dms/archive/assign",
            body={
                "dossierKey": "DK-API",
                "branch": "3045",
                "shelf": "B2",
                "row": "05",
                "binder": "Z88",
            },
        )
        self.assertEqual(code, 200)
        code2, g = dms.handle_request(
            "GET", "/api/dms/archive", query={"barcode": [a["barcode"]]}
        )
        self.assertEqual(code2, 200)
        self.assertTrue(g["found"])

    def test_404(self):
        code, payload = dms.handle_request("GET", "/api/dms/nope")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
