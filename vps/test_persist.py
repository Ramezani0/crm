"""Unit tests for P1 persist helpers — FakeConn (no live Postgres / no wipe)."""
from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import unittest
from pathlib import Path

import persist


class FakeCursor:
    def __init__(self, store: "FakeStore"):
        self.store = store
        self._result = None
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=None):
        params = list(params or [])
        text = " ".join(str(sql).split())
        upper = text.upper()
        self._result = None
        self._rows = []

        if "INSERT INTO AUDIT_LOGS" in upper:
            row = {
                "id": self.store.next_audit_id(),
                "table_name": params[0],
                "record_id": params[1],
                "action": params[2],
                "old_data": _maybe_json(params[3]),
                "new_data": _maybe_json(params[4]),
                "changed_fields": _maybe_json(params[5]),
                "performed_by": params[6],
                "client_ip": params[7],
                "user_agent": params[8],
                "reason": params[9],
                "source": params[10],
                "created_at": "2026-09-24T02:00:00+00:00",
            }
            self.store.audit.append(row)
            self._result = {"id": row["id"], "created_at": row["created_at"]}
            return

        if "FROM CUSTOMERS" in upper and "WHERE" in upper and "UPDATE" not in upper:
            code = params[0]
            for c in self.store.customers:
                if str(c.get("holder_code") or "").strip() == code or str(c.get("id")) == code:
                    self._result = dict(c)
                    return
            self._result = None
            return

        if upper.startswith("UPDATE CUSTOMERS"):
            cust_id = params[-1]
            # parse SET fields from params order used by patch helper
            # We trust the helper SET order: collect from changed SQL
            sets = re.findall(r"SET (.+) WHERE", text, flags=re.I)[0]
            fields = [p.strip().split("=")[0].strip() for p in sets.split(",")]
            for c in self.store.customers:
                if c["id"] == cust_id:
                    for i, f in enumerate(fields):
                        c[f] = params[i]
                    self._result = dict(c)
                    return
            self._result = None
            return

        if "FROM INSTALLMENTS" in upper and "UPDATE" not in upper:
            iid = str(params[0])
            for inst in self.store.installments:
                if str(inst["id"]) == iid:
                    self._result = dict(inst)
                    return
            self._result = None
            return

        if upper.startswith("UPDATE INSTALLMENTS"):
            iid = str(params[-1])
            for inst in self.store.installments:
                if str(inst["id"]) == iid:
                    inst["paid_amount"] = params[0]
                    inst["paid_date"] = params[1]
                    if params[2]:
                        inst["payment_method"] = params[2]
                    inst["status"] = params[3]
                    self._result = dict(inst)
                    return
            self._result = None
            return

        
        if "FROM POLICIES" in upper and "UPDATE" not in upper:
            pid = str(params[0])
            for pol in self.store.policies:
                if str(pol["id"]) == pid:
                    self._result = dict(pol)
                    return
            self._result = None
            return

        if upper.startswith("UPDATE POLICIES"):
            pid = str(params[-1])
            for pol in self.store.policies:
                if str(pol["id"]) == pid:
                    pol["status"] = params[0]
                    self._result = dict(pol)
                    return
            self._result = None
            return

        if "INSERT INTO CUSTOMER_DOCUMENTS" in upper:
            row = {
                "id": self.store.next_doc_id(),
                "policyholder_code": params[0],
                "national_id": params[1],
                "policy_number": params[2],
                "computer_code": params[3],
                "installment_key": params[4],
                "category": params[5],
                "file_title": params[6],
                "storage_path": params[7],
                "mime_type": params[8],
                "file_size_bytes": params[9],
                "sha256_checksum": params[10],
                "uploaded_by": params[11],
                "source_system": params[12],
                "case_365": _maybe_json(params[13]) or {},
                "created_at": "2026-09-24T02:00:00+00:00",
                "deleted_at": None,
            }
            self.store.documents.append(row)
            self._result = dict(row)
            return

        if upper.startswith("UPDATE CUSTOMER_DOCUMENTS") and "DELETED_AT" in upper:
            doc_id = params[0]
            for d in self.store.documents:
                if str(d["id"]) == str(doc_id) and not d.get("deleted_at"):
                    d["deleted_at"] = "2026-09-24T03:00:00+00:00"
                    self._result = dict(d)
                    return
            self._result = None
            return

        if "FROM CUSTOMER_DOCUMENTS" in upper:
            if "WHERE ID =" in upper:
                doc_id = params[0]
                for d in self.store.documents:
                    if str(d["id"]) == str(doc_id):
                        self._result = dict(d)
                        return
                self._result = None
                return
            # list
            rows = list(self.store.documents)
            if "DELETED_AT IS NULL" in upper:
                rows = [d for d in rows if not d.get("deleted_at")]
            # crude filter: if first params look like filters before limit
            limit = int(params[-1]) if params else 100
            if len(params) >= 2:
                # apply equality on known columns if present in SQL
                if "POLICYHOLDER_CODE" in upper:
                    ph = params[0]
                    rows = [d for d in rows if str(d.get("policyholder_code") or "") == ph]
            self._rows = [dict(r) for r in rows[:limit]]
            return

        if "FROM AUDIT_LOGS" in upper:
            rows = list(reversed(self.store.audit))
            limit = int(params[-1]) if params else 100
            idx = 0
            if "TABLE_NAME =" in upper:
                rows = [r for r in rows if r["table_name"] == params[idx]]
                idx += 1
            if "RECORD_ID =" in upper:
                rows = [r for r in rows if r["record_id"] == params[idx]]
                idx += 1
            if "PERFORMED_BY =" in upper:
                rows = [r for r in rows if r["performed_by"] == params[idx]]
            self._rows = [dict(r) for r in rows[:limit]]
            return

        raise AssertionError(f"Unhandled SQL in FakeCursor: {text[:200]}")

    def fetchone(self):
        return self._result

    def fetchall(self):
        return list(self._rows)


def _maybe_json(v):
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except Exception:
        return v


class FakeStore:
    def __init__(self):
        self.customers = []
        self.installments = []
        self.policies = []
        self.documents = []
        self.audit = []
        self._aid = 1
        self._did = 1

    def next_audit_id(self):
        i = self._aid
        self._aid += 1
        return i

    def next_doc_id(self):
        i = self._did
        self._did += 1
        return i


class FakeConn:
    def __init__(self, store: FakeStore | None = None):
        self.store = store or FakeStore()

    def cursor(self):
        return FakeCursor(self.store)

    def rollback(self):
        pass

    def commit(self):
        pass


class PureHelperTests(unittest.TestCase):
    def test_derive_status(self):
        self.assertEqual(persist.derive_installment_status(100, 100), "paid")
        self.assertEqual(persist.derive_installment_status(100, 40), "partial")
        self.assertEqual(persist.derive_installment_status(100, 0, "due"), "due")

    def test_normalize_jalali(self):
        self.assertEqual(persist.normalize_jalali_text("۱۴۰۴/۰۱/۰۲"), "1404/01/02")
        self.assertIsNotNone(persist.normalize_jalali_text("2026-09-24"))
        self.assertTrue(persist.today_jalali_text().startswith("14"))

    def test_normalize_mobile(self):
        self.assertEqual(persist.normalize_mobile("09121234567"), "09121234567")
        self.assertEqual(persist.normalize_mobile("+989121234567"), "09121234567")


class CustomerPatchTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.store.customers.append(
            {
                "id": "825221",
                "full_name": "حسین",
                "national_id": "3051207373",
                "phone": "09131111111",
                "note": "old",
                "holder_code": "825221",
                "source_system": "fasihicrm",
            }
        )
        self.conn = FakeConn(self.store)

    def test_patch_mobile_name_note_preserves_source(self):
        r = persist.patch_customer_by_policyholder_code(
            self.conn,
            "825221",
            {"mobile": "09132222222", "name": "حسین جدید", "note": "note2"},
            performed_by="tester",
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["updated"])
        self.assertEqual(r["customer"]["phone"], "09132222222")
        self.assertEqual(r["customer"]["fullName"], "حسین جدید")
        self.assertEqual(r["customer"]["note"], "note2")
        self.assertEqual(r["sourceSystemPreserved"], "fasihicrm")
        self.assertEqual(self.store.customers[0]["source_system"], "fasihicrm")
        self.assertEqual(len(self.store.audit), 1)
        self.assertEqual(self.store.audit[0]["action"], "UPDATE")

    def test_reject_source_system_mutation(self):
        r = persist.patch_customer_by_policyholder_code(
            self.conn, "825221", {"source_system": "evil", "note": "x"}
        )
        self.assertFalse(r["ok"])
        self.assertEqual(r.get("code"), "source_system_locked")

    def test_not_found(self):
        r = persist.patch_customer_by_policyholder_code(self.conn, "nope", {"note": "x"})
        self.assertFalse(r["ok"])
        self.assertEqual(r.get("code"), "not_found")


class InstallmentPaymentTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.store.installments.append(
            {
                "id": "I-1",
                "amount": 1000,
                "paid_amount": 0,
                "paid_date": "",
                "payment_method": "",
                "status": "overdue",
                "holder_code": "825221",
                "source_system": "fasihicrm",
                "due_date": "1404/01/01",
                "policy_number": "7",
                "computer_code": "2395721",
            }
        )
        self.conn = FakeConn(self.store)

    def test_payment_partial_then_paid(self):
        r1 = persist.register_installment_payment(
            self.conn,
            {"installmentId": "I-1", "amount": 400, "method": "card", "paidDate": "1404/06/01"},
            performed_by="cashier",
        )
        self.assertTrue(r1["ok"], r1)
        self.assertEqual(r1["installment"]["status"], "partial")
        self.assertEqual(r1["installment"]["paidAmount"], 400)
        self.assertEqual(r1["installment"]["paidDate"], "1404/06/01")
        self.assertEqual(r1["sourceSystemPreserved"], "fasihicrm")

        r2 = persist.register_installment_payment(
            self.conn,
            {"installmentId": "I-1", "amount": 600, "method": "cash"},
            performed_by="cashier",
        )
        self.assertTrue(r2["ok"], r2)
        self.assertEqual(r2["installment"]["status"], "paid")
        self.assertEqual(r2["installment"]["paidAmount"], 1000)
        self.assertEqual(len(self.store.audit), 2)


class DocumentAndAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        os.environ["DOCUMENTS_ROOT"] = str(self.root)
        self.store = FakeStore()
        self.conn = FakeConn(self.store)

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("DOCUMENTS_ROOT", None)

    def test_upload_list_get_file(self):
        payload = base64.b64encode(b"hello-fasihi").decode("ascii")
        r = persist.create_customer_document(
            self.conn,
            {
                "policyholderCode": "825221",
                "category": "payment_receipt",
                "fileTitle": "رسید",
                "filename": "receipt.txt",
                "mimeType": "text/plain",
                "contentBase64": payload,
            },
            performed_by="uploader",
            root=self.root,
        )
        self.assertTrue(r["ok"], r)
        doc = r["document"]
        self.assertEqual(doc["category"], "payment_receipt")
        self.assertEqual(len(doc["sha256"]), 64)
        abs_path = self.root / doc["storagePath"]
        self.assertTrue(abs_path.is_file())
        self.assertEqual(abs_path.read_bytes(), b"hello-fasihi")

        listed = persist.list_customer_documents(
            self.conn, {"policyholderCode": ["825221"]}
        )
        self.assertEqual(listed["count"], 1)

        got = persist.get_customer_document(self.conn, str(doc["id"]))
        self.assertTrue(got["ok"])

        resolved = persist.resolve_document_file(self.conn, str(doc["id"]), root=self.root)
        self.assertTrue(resolved["ok"])
        self.assertTrue(Path(resolved["_file"]).is_file())

        audits = persist.list_audit_logs(self.conn, {"table": ["customer_documents"]})
        self.assertGreaterEqual(audits["count"], 1)

    def test_handle_request_meta_and_patch(self):
        self.store.customers.append(
            {
                "id": "1",
                "full_name": "A",
                "national_id": "",
                "phone": "09120000000",
                "note": "",
                "holder_code": "1",
                "source_system": "fasihicrm",
            }
        )
        code, meta = persist.handle_request("GET", "/api/persist/meta", conn=self.conn)
        self.assertEqual(code, 200)
        self.assertTrue(meta["ok"])

        code, payload = persist.handle_request(
            "PATCH",
            "/api/customers/1",
            body={"note": "via-handle"},
            conn=self.conn,
            performed_by="api",
        )
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["customer"]["note"], "via-handle")


    def test_soft_delete_and_nested_routes(self):
        payload = base64.b64encode(b"doc-soft").decode("ascii")
        code, created = persist.handle_request(
            "POST",
            "/api/customers/825221/documents",
            body={
                "category": "id_card",
                "fileTitle": "کارت",
                "filename": "id.txt",
                "mimeType": "text/plain",
                "contentBase64": payload,
            },
            conn=self.conn,
            root=self.root,
            performed_by="tester",
        )
        self.assertEqual(code, 200, created)
        self.assertTrue(created["ok"])
        doc_id = str(created["document"]["id"])

        code, listed = persist.handle_request(
            "GET",
            "/api/customers/825221/documents",
            query={},
            conn=self.conn,
        )
        self.assertEqual(code, 200)
        self.assertEqual(listed["count"], 1)

        code, deleted = persist.handle_request(
            "DELETE",
            f"/api/customers/825221/documents/{doc_id}",
            conn=self.conn,
            performed_by="tester",
        )
        self.assertEqual(code, 200, deleted)
        self.assertTrue(deleted["ok"])
        self.assertTrue(deleted["document"].get("deletedAt"))

        code, listed2 = persist.handle_request(
            "GET",
            "/api/customers/825221/documents",
            query={},
            conn=self.conn,
        )
        self.assertEqual(code, 200)
        self.assertEqual(listed2["count"], 0)

        code, again = persist.handle_request(
            "DELETE",
            f"/api/customer-documents/{doc_id}",
            conn=self.conn,
        )
        self.assertEqual(code, 200)
        self.assertTrue(again["ok"])
        self.assertFalse(again.get("updated"))





class RenewalMarkTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.store.policies.append(
            {
                "id": "P-1",
                "policy_number": "1404-1",
                "computer_code": "2395721",
                "status": "جاری",
                "holder_code": "825221",
                "source_system": "fasihicrm",
                "note": "",
                "end_date": "1404/07/15",
            }
        )
        self.conn = FakeConn(self.store)

    def test_mark_renewed_preserves_source(self):
        r = persist.mark_policy_renewed(
            self.conn,
            {"policyId": "P-1"},
            performed_by="staff",
        )
        self.assertTrue(r["ok"], r)
        self.assertTrue(r["updated"])
        self.assertEqual(r["policy"]["status"], "تمدید شد")
        self.assertEqual(r["sourceSystemPreserved"], "fasihicrm")
        self.assertEqual(self.store.policies[0]["source_system"], "fasihicrm")
        self.assertEqual(self.store.audit[0]["reason"], "renewal_marked")
        self.assertEqual(len(self.store.audit), 1)

    def test_mark_idempotent(self):
        persist.mark_policy_renewed(self.conn, {"policyId": "P-1"})
        r2 = persist.mark_policy_renewed(self.conn, {"policyId": "P-1"})
        self.assertTrue(r2["ok"], r2)
        self.assertTrue(r2.get("alreadyRenewed"))
        self.assertEqual(len(self.store.audit), 1)

    def test_route_post(self):
        code, payload = persist.handle_request(
            "POST",
            "/api/renewals/mark",
            {"policyId": "P-1"},
            conn=self.conn,
            performed_by="staff",
        )
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])


if __name__ == "__main__":
    unittest.main()
