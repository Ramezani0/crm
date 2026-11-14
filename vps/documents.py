#!/usr/bin/env python3
"""ماژول اسناد دیجیتال — بارگذاری و نگه‌داری مدارک پروندهٔ بیمه‌گذار.

طراحی عمداً ساده است و با پشتهٔ موجود می‌خواند: فایل روی دیسک سرور، ایندکس در
PostgreSQL. نه MinIO، نه S3، نه سرویس بیرونی — چون سرور از ایران به سرویس‌های
ابری نمی‌رسد و افزودن وابستگی جدید به پشته ممنوع است.

سه قاعدهٔ ایمنی که رعایت شده:

۱. **نام فایل کاربر هرگز به مسیر دیسک تبدیل نمی‌شود.** مسیر از روی چک‌سام
   ساخته می‌شود تا `../../etc/passwd` بی‌اثر باشد.
۲. **نوع فایل از محتوا تشخیص داده می‌شود، نه از پسوند.** پسوند `.jpg` روی یک
   فایل اجرایی چیزی را اثبات نمی‌کند.
۳. **چک‌سام SHA-256 ذخیره می‌شود** تا بعداً بتوان ثابت کرد مدرک دست‌کاری نشده —
   همان چیزی که در ادعای خسارت به آن استناد می‌شود.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
import uuid
from datetime import datetime, timezone

#: ریشهٔ ذخیره‌سازی؛ در کانتینر API مانت می‌شود.
DOCUMENTS_ROOT = os.environ.get("DOCUMENTS_ROOT", "/opt/fasihi/documents")

#: سقف حجم هر فایل (بایت). عکس موبایل معمولاً زیر ۸ مگابایت است.
MAX_FILE_BYTES = int(os.environ.get("DOCUMENT_MAX_BYTES", 8 * 1024 * 1024))

#: دسته‌های مدرک — بر پایهٔ رشته‌هایی که نمایندگی واقعاً صادر می‌کند.
CATEGORIES = {
    "identity": "مدارک هویتی (کارت ملی، شناسنامه)",
    "vehicle": "مدارک خودرو (کارت خودرو، برگ سبز)",
    "vehicle_inspection": "بازدید اولیه خودرو",
    "property": "مدارک ملک و آتش‌سوزی",
    "medical": "مدارک پزشکی و پرسشنامه سلامت",
    "proposal": "فرم پیشنهاد امضاشده",
    "policy_document": "نسخهٔ بیمه‌نامه و الحاقیه",
    "payment_receipt": "فیش واریز و رسید پرداخت",
    "claim": "مدارک خسارت",
    "legal": "قرارداد و مدارک حقوقی",
    "other": "سایر",
}

#: امضای بایت‌های ابتدایی فایل → نوع محتوا. تشخیص از روی محتوا، نه پسوند.
_MAGIC = (
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"%PDF-", "application/pdf", ".pdf"),
    (b"GIF87a", "image/gif", ".gif"),
    (b"GIF89a", "image/gif", ".gif"),
)

_SAFE_TITLE_RE = re.compile(r"[\r\n\t\x00]")


class DocumentError(Exception):
    """خطای قابل نمایش به کاربر."""


def sniff_mime(blob: bytes):
    """(mime, پسوند) از روی بایت‌های ابتدایی. ناشناخته → استثنا."""
    if blob.startswith(b"RIFF") and blob[8:12] == b"WEBP":
        return "image/webp", ".webp"
    for magic, mime, ext in _MAGIC:
        if blob.startswith(magic):
            return mime, ext
    raise DocumentError("فقط تصویر (JPG، PNG، WEBP، GIF) و PDF پذیرفته می‌شود")


def decode_payload(raw_base64: str) -> bytes:
    """محتوای base64 را باز می‌کند و سقف حجم را کنترل می‌کند."""
    if not raw_base64:
        raise DocumentError("فایلی ارسال نشده است")
    data = raw_base64.strip()
    # پیشوند data URL مرورگر: data:image/jpeg;base64,....
    if data.startswith("data:"):
        _, _, data = data.partition(",")
    # سقف را قبل از decode هم چک کن تا حافظه بیهوده اشغال نشود
    if len(data) > (MAX_FILE_BYTES * 4 // 3) + 1024:
        raise DocumentError("حجم فایل بیش از حد مجاز است (۸ مگابایت)")
    try:
        blob = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise DocumentError("محتوای فایل معتبر نیست")
    if not blob:
        raise DocumentError("فایل خالی است")
    if len(blob) > MAX_FILE_BYTES:
        raise DocumentError("حجم فایل بیش از حد مجاز است (۸ مگابایت)")
    return blob


def clean_title(raw: str, fallback: str) -> str:
    title = _SAFE_TITLE_RE.sub(" ", str(raw or "")).strip()
    title = " ".join(title.split())
    return title[:150] or fallback


def storage_path(customer_id: str, checksum: str, ext: str):
    """مسیر نسبی و مطلق فایل.

    مسیر فقط از شناسهٔ مشتری (که خودمان ساخته‌ایم) و چک‌سام ساخته می‌شود؛
    نام فایل کاربر هیچ نقشی در مسیر ندارد تا عبور از پوشه ممکن نباشد.
    """
    safe_customer = re.sub(r"[^A-Za-z0-9_-]", "", str(customer_id))[:48] or "unknown"
    rel = os.path.join(safe_customer, checksum[:2], checksum + ext)
    return rel, os.path.join(DOCUMENTS_ROOT, rel)


def ensure_table(conn) -> None:
    """جدول اسناد؛ idempotent."""
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS customer_documents (
                id              TEXT PRIMARY KEY,
                customer_id     TEXT NOT NULL,
                policy_id       TEXT,
                policy_number   TEXT,
                category        TEXT NOT NULL,
                title           TEXT NOT NULL,
                original_name   TEXT,
                storage_path    TEXT NOT NULL,
                mime_type       TEXT NOT NULL,
                size_bytes      BIGINT NOT NULL,
                sha256          TEXT NOT NULL,
                note            TEXT,
                uploaded_by     TEXT,
                uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at      TIMESTAMPTZ
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_docs_customer "
            "ON customer_documents (customer_id) WHERE deleted_at IS NULL"
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_docs_policy "
            "ON customer_documents (policy_number) WHERE deleted_at IS NULL"
        )
    conn.commit()


def save_document(conn, *, customer_id: str, body: dict, actor: str = "") -> dict:
    """یک مدرک را ذخیره می‌کند و ردیف ایندکس را برمی‌گرداند."""
    if not customer_id:
        raise DocumentError("شناسهٔ بیمه‌گذار خالی است")

    category = str(body.get("category") or "other").strip()
    if category not in CATEGORIES:
        raise DocumentError("دستهٔ مدرک نامعتبر است")

    blob = decode_payload(body.get("content") or body.get("base64") or "")
    mime, ext = sniff_mime(blob)
    checksum = hashlib.sha256(blob).hexdigest()
    original = clean_title(body.get("fileName"), "")
    title = clean_title(body.get("title"), original or CATEGORIES[category])

    rel, absolute = storage_path(customer_id, checksum, ext)
    os.makedirs(os.path.dirname(absolute), exist_ok=True)
    if not os.path.exists(absolute):
        # نوشتن اتمیک: فایل ناقص هرگز در مسیر نهایی دیده نمی‌شود
        tmp = absolute + ".part"
        with open(tmp, "wb") as fh:
            fh.write(blob)
        os.replace(tmp, absolute)

    doc_id = "D-" + uuid.uuid4().hex[:20]
    row = {
        "id": doc_id,
        "customerId": customer_id,
        "policyNumber": clean_title(body.get("policyNumber"), "") or None,
        "category": category,
        "categoryLabel": CATEGORIES[category],
        "title": title,
        "originalName": original or None,
        "mimeType": mime,
        "sizeBytes": len(blob),
        "sha256": checksum,
        "note": clean_title(body.get("note"), "") or None,
        "uploadedBy": actor or None,
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO customer_documents
                (id, customer_id, policy_number, category, title, original_name,
                 storage_path, mime_type, size_bytes, sha256, note, uploaded_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (doc_id, customer_id, row["policyNumber"], category, title,
             row["originalName"], rel, mime, len(blob), checksum,
             row["note"], row["uploadedBy"]),
        )
    conn.commit()
    return row


def list_documents(conn, customer_id: str) -> list:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, customer_id, policy_number, category, title, original_name,
                   mime_type, size_bytes, sha256, note, uploaded_by, uploaded_at
              FROM customer_documents
             WHERE customer_id = %s AND deleted_at IS NULL
             ORDER BY uploaded_at DESC
            """,
            (customer_id,),
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        category = r["category"]
        out.append({
            "id": r["id"],
            "customerId": r["customer_id"],
            "policyNumber": r["policy_number"],
            "category": category,
            "categoryLabel": CATEGORIES.get(category, category),
            "title": r["title"],
            "originalName": r["original_name"],
            "mimeType": r["mime_type"],
            "sizeBytes": int(r["size_bytes"] or 0),
            "sha256": r["sha256"],
            "note": r["note"],
            "uploadedBy": r["uploaded_by"],
            "uploadedAt": r["uploaded_at"].isoformat() if r["uploaded_at"] else None,
        })
    return out


def read_document(conn, doc_id: str):
    """(متادیتا، بایت‌ها) برای دانلود؛ None اگر پیدا نشد."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, storage_path, mime_type, title, original_name, sha256 "
            "FROM customer_documents WHERE id = %s AND deleted_at IS NULL",
            (doc_id,),
        )
        row = cur.fetchone()
    if not row:
        return None, None
    absolute = os.path.join(DOCUMENTS_ROOT, row["storage_path"])
    # مسیر نهایی باید حتماً زیر ریشه بماند
    root = os.path.realpath(DOCUMENTS_ROOT)
    if not os.path.realpath(absolute).startswith(root + os.sep):
        raise DocumentError("مسیر فایل نامعتبر است")
    if not os.path.exists(absolute):
        return row, None
    with open(absolute, "rb") as fh:
        return row, fh.read()


def soft_delete(conn, doc_id: str, actor: str = "") -> bool:
    """حذف نرم — ردیف می‌ماند و فایل روی دیسک دست‌نخورده باقی است.

    مدرک بیمه‌ای سند استناد است؛ حذف فیزیکی انجام نمی‌شود.
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE customer_documents SET deleted_at = NOW() "
            "WHERE id = %s AND deleted_at IS NULL",
            (doc_id,),
        )
        changed = cur.rowcount
    conn.commit()
    return bool(changed)
