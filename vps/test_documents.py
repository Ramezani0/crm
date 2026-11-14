"""Unit tests for durable documents.py — tempfile root, FakeConn (no live Postgres)."""
from __future__ import annotations

import base64
import os
import tempfile
import unittest
from pathlib import Path

import documents


class FakeCursor:
    def __init__(self, store: "FakeStore"):
        self.store = store
        self.rowcount = 0
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
        self.rowcount = 0

        if upper.startswith("CREATE TABLE") or upper.startswith("CREATE INDEX"):
            return

        if "INSERT INTO CUSTOMER_DOCUMENTS" in upper:
            row = {
                "id": params[0],
                "customer_id": params[1],
                "policy_number": params[2],
                "category": params[3],
                "title": params[4],
                "original_name": params[5],
                "storage_path": params[6],
                "mime_type": params[7],
                "size_bytes": params[8],
                "sha256": params[9],
                "note": params[10],
                "uploaded_by": params[11],
                "uploaded_at": documents.datetime.now(documents.timezone.utc),
                "deleted_at": None,
            }
            self.store.docs.append(row)
            self.rowcount = 1
            return

        if "FROM CUSTOMER_DOCUMENTS" in upper and "WHERE CUSTOMER_ID" in upper:
            cid = params[0]
            rows = [
                d
                for d in self.store.docs
                if d["customer_id"] == cid and not d.get("deleted_at")
            ]
            rows.sort(key=lambda r: r["uploaded_at"], reverse=True)
            self._rows = rows
            return

        if "FROM CUSTOMER_DOCUMENTS" in upper and "WHERE ID =" in upper:
            doc_id = params[0]
            for d in self.store.docs:
                if d["id"] == doc_id and not d.get("deleted_at"):
                    self._result = dict(d)
                    return
            self._result = None
            return

        if upper.startswith("UPDATE CUSTOMER_DOCUMENTS") and "DELETED_AT" in upper:
            doc_id = params[0]
            for d in self.store.docs:
                if d["id"] == doc_id and not d.get("deleted_at"):
                    d["deleted_at"] = documents.datetime.now(documents.timezone.utc)
                    self.rowcount = 1
                    return
            self.rowcount = 0
            return

    def fetchone(self):
        return self._result

    def fetchall(self):
        return list(self._rows)


class FakeStore:
    def __init__(self):
        self.docs = []


class FakeConn:
    def __init__(self, store: FakeStore):
        self.store = store

    def cursor(self):
        return FakeCursor(self.store)

    def commit(self):
        return None


class DocumentsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        os.environ["DOCUMENTS_ROOT"] = str(self.root)
        # reload module constants that read env at import — patch attribute
        documents.DOCUMENTS_ROOT = str(self.root)
        self.store = FakeStore()
        self.conn = FakeConn(self.store)

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop("DOCUMENTS_ROOT", None)

    def test_sniff_pdf_jpg_png(self):
        self.assertEqual(documents.sniff_mime(b"%PDF-1.4\n")[0], "application/pdf")
        self.assertEqual(documents.sniff_mime(b"\xff\xd8\xff\xe0")[0], "image/jpeg")
        self.assertEqual(documents.sniff_mime(b"\x89PNG\r\n\x1a\nxxxx")[0], "image/png")
        with self.assertRaises(documents.DocumentError):
            documents.sniff_mime(b"MZ\x90\x00")

    def test_reject_oversize(self):
        big = base64.b64encode(b"x" * (documents.MAX_FILE_BYTES + 10)).decode()
        with self.assertRaises(documents.DocumentError):
            documents.decode_payload(big)

    def test_save_list_read_soft_delete(self):
        pdf = b"%PDF-1.4\n% durable-test\n"
        b64 = base64.b64encode(pdf).decode()
        row = documents.save_document(
            self.conn,
            customer_id="C-K825221",
            body={
                "category": "identity",
                "title": "کارت ملی تست",
                "fileName": "nid.pdf",
                "content": b64,
            },
            actor="eng-test",
        )
        self.assertTrue(str(row["id"]).startswith("D-"))
        self.assertEqual(row["mimeType"], "application/pdf")
        self.assertEqual(row["sizeBytes"], len(pdf))
        abs_path = self.root / "CK825221" / row["sha256"][:2] / (row["sha256"] + ".pdf")
        # storage_path uses sanitized customer_id
        rel = None
        for d in self.store.docs:
            if d["id"] == row["id"]:
                rel = d["storage_path"]
        self.assertIsNotNone(rel)
        self.assertTrue((self.root / rel).is_file())

        items = documents.list_documents(self.conn, "C-K825221")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "کارت ملی تست")

        meta, blob = documents.read_document(self.conn, row["id"])
        self.assertIsNotNone(meta)
        self.assertEqual(blob, pdf)

        ok = documents.soft_delete(self.conn, row["id"])
        self.assertTrue(ok)
        items2 = documents.list_documents(self.conn, "C-K825221")
        self.assertEqual(len(items2), 0)
        # file remains on disk
        self.assertTrue((self.root / rel).is_file())

    def test_path_traversal_blocked_by_checksum_path(self):
        pdf = b"%PDF-1.4\nx"
        b64 = base64.b64encode(pdf).decode()
        row = documents.save_document(
            self.conn,
            customer_id="../../etc",
            body={"category": "other", "content": b64, "fileName": "x.pdf"},
        )
        rel = self.store.docs[0]["storage_path"]
        self.assertNotIn("..", rel)
        self.assertTrue(rel.startswith("etc/") or rel.startswith("unknown/"))


if __name__ == "__main__":
    unittest.main()
