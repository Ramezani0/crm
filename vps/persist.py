"""P1 durability — customer PATCH, installment payment, documents, audit_logs,
plus Policy Transfer, Dossier 365, and Persistent SMS/Urgent Tasks.

Additive only. NEVER DELETE/TRUNCATE CRM tables. Preserve source_system.
Logical policyholder_code → physical customers.holder_code (and id when equal).
Jalali dates stay TEXT yyyy/mm/dd.
case_365 Persian JSON untouched.

Cite:
  ENG_P1_PERSIST_PREP_20260924.md
  ENG_ACK_IMPORT_PERSIST_20260924.md
  docs/P1_PERSIST_MERGE.md
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote

MODULE = "persist"
MODULE_LABEL = "پایداری CRM"
DOCUMENTS_ROOT_DEFAULT = "/opt/fasihi/documents"
ALLOWED_CUSTOMER_PATCH = frozenset({"mobile", "phone", "name", "full_name", "fullName", "note"})
INSTALLMENT_STATUS_ENUM = frozenset({"paid", "due", "overdue", "partial"})
AUDIT_ACTIONS = frozenset({"INSERT", "UPDATE", "DELETE", "TRANSFER"})
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._\-\u0600-\u06FF]+")
PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
PHONE_RE = re.compile(r"^09\d{9}$")
YMD_RE = re.compile(r"^(\d{4})[/.\\-](\d{1,2})[/.\\-](\d{1,2})")


def documents_root() -> Path:
    return Path(os.environ.get("DOCUMENTS_ROOT") or DOCUMENTS_ROOT_DEFAULT)


def to_en_digits(value: Any) -> str:
    return str(value or "").translate(PERSIAN_DIGITS)


def normalize_mobile(value: Any) -> str:
    raw = to_en_digits(value).strip()
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    if digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits if PHONE_RE.match(digits) else digits


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(to_en_digits(value).replace(",", ""))
    except (TypeError, ValueError):
        return default


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _qget(query: dict | None, key: str) -> str | None:
    if not query:
        return None
    v = query.get(key)
    if isinstance(v, list):
        v = v[0] if v else None
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def gregorian_to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    """Inverse of common 33-year cycle used in app.py jalali_to_gregorian."""
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy - 1600 if gy > 1600 else gy - 621
    days = (
        365 * gy2
        + (gy2 + 3) // 4
        - (gy2 + 99) // 100
        + (gy2 + 399) // 400
        - 80
        + gd
        + g_d_m[gm - 1]
    )
    jy = 979 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm = 1 + days // 31
        jd = 1 + (days % 31)
    else:
        jm = 7 + (days - 186) // 30
        jd = 1 + ((days - 186) % 30)
    return jy, jm, jd


def today_jalali_text() -> str:
    t = date.today()
    jy, jm, jd = gregorian_to_jalali(t.year, t.month, t.day)
    return f"{jy}/{jm:02d}/{jd:02d}"


def normalize_jalali_text(raw: Any) -> str | None:
    """Return ASCII Jalali yyyy/mm/dd or None if empty/invalid."""
    text = to_en_digits(raw).strip()
    if not text:
        return None
    m = YMD_RE.match(text)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1200 <= y <= 1500):
        # Accept Gregorian ISO → convert to Jalali for storage
        if 1600 <= y <= 2200:
            jy, jm, jd = gregorian_to_jalali(y, mo, d)
            return f"{jy}/{jm:02d}/{jd:02d}"
        return None
    return f"{y}/{mo:02d}/{d:02d}"


def derive_installment_status(amount: float, paid_amount: float, wired: str = "") -> str:
    wired_l = str(wired or "").strip().lower()
    if amount > 0 and paid_amount >= amount:
        return "paid"
    if paid_amount > 0:
        return "partial"
    if wired_l in INSTALLMENT_STATUS_ENUM and wired_l not in {"paid", "partial"}:
        return wired_l
    return "due" if wired_l == "due" else (wired_l if wired_l in INSTALLMENT_STATUS_ENUM else "overdue")


def _json_dumps(obj: Any) -> str | None:
    if obj is None:
        return None
    return json.dumps(obj, ensure_ascii=False, default=str)


def ensure_operational_tables(conn) -> None:
    """Ensure additive tables for transfers, dossiers, sms, and urgent_tasks exist."""
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS policy_transfers (
                id BIGSERIAL PRIMARY KEY,
                policy_id TEXT NOT NULL,
                policy_number TEXT,
                from_holder_code TEXT NOT NULL,
                to_holder_code TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                performed_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_policy_transfers_policy ON policy_transfers(policy_id);

            CREATE TABLE IF NOT EXISTS customer_dossiers (
                id BIGSERIAL PRIMARY KEY,
                policyholder_code TEXT UNIQUE NOT NULL,
                dossier_number TEXT UNIQUE NOT NULL,
                case_365 JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS sms_messages (
                id BIGSERIAL PRIMARY KEY,
                direction TEXT NOT NULL DEFAULT 'outbound',
                recipient TEXT NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'sent',
                policyholder_code TEXT,
                policy_number TEXT,
                performed_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_sms_holder ON sms_messages(policyholder_code);

            CREATE TABLE IF NOT EXISTS urgent_tasks (
                id BIGSERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                priority TEXT NOT NULL DEFAULT 'high',
                policyholder_code TEXT,
                policy_number TEXT,
                assigned_to TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_urgent_tasks_holder ON urgent_tasks(policyholder_code);
            """
        )


def insert_audit_log(
    conn,
    *,
    table_name: str,
    record_id: str,
    action: str,
    old_data: Any = None,
    new_data: Any = None,
    changed_fields: Any = None,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    reason: str | None = None,
    source: str = "api",
) -> dict:
    """Insert one audit_logs row. Never updates/deletes audit rows."""
    action_u = str(action or "").strip().upper()
    if action_u not in AUDIT_ACTIONS:
        action_u = "UPDATE"
    table_name = str(table_name or "").strip()
    record_id = str(record_id or "").strip()
    if not table_name or not record_id:
        return {"ok": False, "error": "table_name و record_id الزامی است"}
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO audit_logs (
              table_name, record_id, action,
              old_data, new_data, changed_fields,
              performed_by, client_ip, user_agent, reason, source
            ) VALUES (
              %s, %s, %s,
              %s::jsonb, %s::jsonb, %s::jsonb,
              %s, %s, %s, %s, %s
            )
            RETURNING id, created_at
            """,
            (
                table_name,
                record_id,
                action_u,
                _json_dumps(old_data),
                _json_dumps(new_data),
                _json_dumps(changed_fields),
                performed_by,
                client_ip,
                user_agent,
                reason,
                source or "api",
            ),
        )
        row = cur.fetchone() or {}
    return {
        "ok": True,
        "id": row.get("id") if isinstance(row, dict) else (row[0] if row else None),
        "createdAt": str(row.get("created_at")) if isinstance(row, dict) else None,
    }


def _customer_row_public(row: dict) -> dict:
    phone = str(row.get("phone") or row.get("mobile") or "")
    mobile = normalize_mobile(phone) or phone
    return {
        "id": str(row.get("id") or ""),
        "holderCode": str(row.get("holder_code") or ""),
        "policyholderCode": str(row.get("holder_code") or row.get("id") or ""),
        "fullName": str(row.get("full_name") or ""),
        "nationalId": str(row.get("national_id") or ""),
        "phone": phone,
        "mobile": mobile,
        "note": str(row.get("note") or ""),
        "sourceSystem": str(row.get("source_system") or ""),
    }


def fetch_customer_by_policyholder_code(conn, policyholder_code: str) -> dict | None:
    """Lookup by physical holder_code, else customers.id (Import often equals holder)."""
    code = to_en_digits(policyholder_code).strip()
    if not code:
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, full_name, national_id, phone, note,
                   holder_code, source_system
              FROM customers
             WHERE BTRIM(COALESCE(holder_code, '')) = %s
                OR BTRIM(CAST(id AS TEXT)) = %s
             ORDER BY CASE WHEN BTRIM(COALESCE(holder_code, '')) = %s THEN 0 ELSE 1 END
             LIMIT 1
            """,
            (code, code, code),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def patch_customer_by_policyholder_code(
    conn,
    policyholder_code: str,
    patch: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    reason: str | None = None,
) -> dict:
    """PATCH mobile/name/note only. Preserves source_system. Never DELETE."""
    if not isinstance(patch, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    code = to_en_digits(policyholder_code).strip()
    if not code:
        return {"ok": False, "error": "policyholder_code الزامی است"}

    # Reject attempts to mutate protected fields
    for forbidden in ("source_system", "sourceSystem", "id", "national_id", "nationalId", "holder_code"):
        if forbidden in patch and patch.get(forbidden) is not None:
            if forbidden in ("source_system", "sourceSystem"):
                return {"ok": False, "error": "source_system قابل تغییر نیست", "code": "source_system_locked"}

    row = fetch_customer_by_policyholder_code(conn, code)
    if not row:
        return {"ok": False, "error": "مشتری یافت نشد", "code": "not_found"}

    old_public = _customer_row_public(row)
    sets: list[str] = []
    params: list[Any] = []
    changed: dict[str, Any] = {}

    mobile_in = patch.get("mobile") if "mobile" in patch else patch.get("phone")
    if mobile_in is not None:
        new_phone = normalize_mobile(mobile_in) or to_en_digits(mobile_in).strip()
        old_phone = str(row.get("phone") or row.get("mobile") or "")
        if new_phone != old_phone:
            sets.append("phone = %s")
            params.append(new_phone)
            changed["phone"] = {"old": old_phone, "new": new_phone}

    name_in = None
    for k in ("fullName", "full_name", "name"):
        if k in patch and patch.get(k) is not None:
            name_in = str(patch.get(k)).strip()
            break
    if name_in is not None:
        old_name = str(row.get("full_name") or "")
        if name_in != old_name:
            sets.append("full_name = %s")
            params.append(name_in)
            changed["full_name"] = {"old": old_name, "new": name_in}

    if "note" in patch and patch.get("note") is not None:
        new_note = str(patch.get("note"))
        old_note = str(row.get("note") or "")
        if new_note != old_note:
            sets.append("note = %s")
            params.append(new_note)
            changed["note"] = {"old": old_note, "new": new_note}

    if not sets:
        return {
            "ok": True,
            "updated": False,
            "customer": old_public,
            "message": "بدون تغییر",
        }

    cust_id = row.get("id")
    params.append(cust_id)
    sql = f"UPDATE customers SET {', '.join(sets)} WHERE id = %s RETURNING id, full_name, national_id, phone, note, holder_code, source_system"
    with conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        updated = cur.fetchone()
        if not updated:
            return {"ok": False, "error": "به‌روزرسانی ناموفق"}
        updated = dict(updated)
        audit = insert_audit_log(
            conn,
            table_name="customers",
            record_id=str(updated.get("holder_code") or updated.get("id") or code),
            action="UPDATE",
            old_data=old_public,
            new_data=_customer_row_public(updated),
            changed_fields=changed,
            performed_by=performed_by,
            client_ip=client_ip,
            user_agent=user_agent,
            reason=reason or "customer_patch",
            source="api",
        )
    return {
        "ok": True,
        "updated": True,
        "customer": _customer_row_public(updated),
        "changedFields": list(changed.keys()),
        "audit": audit,
        "sourceSystemPreserved": str(updated.get("source_system") or old_public.get("sourceSystem") or ""),
    }


def register_installment_payment(
    conn,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    reason: str | None = None,
) -> dict:
    """POST payment onto installments row. Preserves source_system. Jalali paid_date."""
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    inst_id = str(
        body.get("installmentId")
        or body.get("installment_id")
        or body.get("id")
        or ""
    ).strip()
    if not inst_id:
        return {"ok": False, "error": "installmentId الزامی است"}
    amount = to_float(body.get("amount"))
    if amount <= 0:
        return {"ok": False, "error": "مبلغ باید بزرگ‌تر از صفر باشد"}
    method = str(body.get("method") or body.get("paymentMethod") or body.get("payment_method") or "").strip()
    paid_date = normalize_jalali_text(
        body.get("paidDate") or body.get("paid_date") or body.get("date")
    ) or today_jalali_text()
    actor = performed_by or str(body.get("performedBy") or body.get("by") or "").strip() or None

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, amount, paid_amount, paid_date, payment_method, status,
                   holder_code, source_system, due_date, policy_number, computer_code
              FROM installments
             WHERE BTRIM(CAST(id AS TEXT)) = %s
             LIMIT 1
            """,
            (inst_id,),
        )
        row = cur.fetchone()
    if not row:
        return {"ok": False, "error": "قسط یافت نشد", "code": "not_found"}
    row = dict(row)
    old_paid = to_float(row.get("paid_amount"))
    total = to_float(row.get("amount"))
    new_paid = old_paid + amount
    if total > 0:
        new_paid = min(new_paid, total)
    new_status = derive_installment_status(total, new_paid, str(row.get("status") or ""))
    old_snap = {
        "id": str(row.get("id")),
        "paidAmount": old_paid,
        "paidDate": str(row.get("paid_date") or ""),
        "paymentMethod": str(row.get("payment_method") or ""),
        "status": str(row.get("status") or ""),
        "sourceSystem": str(row.get("source_system") or ""),
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE installments
               SET paid_amount = %s,
                   paid_date = %s,
                   payment_method = COALESCE(NULLIF(%s, ''), payment_method),
                   status = %s
             WHERE BTRIM(CAST(id AS TEXT)) = %s
             RETURNING id, amount, paid_amount, paid_date, payment_method, status,
                       holder_code, source_system, due_date
            """,
            (new_paid, paid_date, method, new_status, inst_id),
        )
        updated = cur.fetchone()
        if not updated:
            return {"ok": False, "error": "ثبت پرداخت ناموفق"}
        updated = dict(updated)
        new_snap = {
            "id": str(updated.get("id")),
            "paidAmount": to_float(updated.get("paid_amount")),
            "paidDate": str(updated.get("paid_date") or ""),
            "paymentMethod": str(updated.get("payment_method") or ""),
            "status": str(updated.get("status") or ""),
            "sourceSystem": str(updated.get("source_system") or ""),
            "paymentAdded": amount,
            "method": method,
            "by": actor,
        }
        audit = insert_audit_log(
            conn,
            table_name="installments",
            record_id=str(updated.get("id")),
            action="UPDATE",
            old_data=old_snap,
            new_data=new_snap,
            changed_fields={
                "paid_amount": {"old": old_paid, "new": new_paid},
                "paid_date": {"old": old_snap["paidDate"], "new": paid_date},
                "status": {"old": old_snap["status"], "new": new_status},
                **({"payment_method": {"old": old_snap["paymentMethod"], "new": method}} if method else {}),
            },
            performed_by=actor,
            client_ip=client_ip,
            user_agent=user_agent,
            reason=reason or "installment_payment",
            source="api",
        )
    return {
        "ok": True,
        "installment": {
            "id": str(updated.get("id")),
            "amount": to_float(updated.get("amount")),
            "paidAmount": to_float(updated.get("paid_amount")),
            "paidDate": str(updated.get("paid_date") or ""),
            "paymentMethod": str(updated.get("payment_method") or ""),
            "status": str(updated.get("status") or ""),
            "holderCode": str(updated.get("holder_code") or ""),
            "dueDate": str(updated.get("due_date") or ""),
            "sourceSystem": str(updated.get("source_system") or ""),
        },
        "audit": audit,
        "sourceSystemPreserved": str(updated.get("source_system") or ""),
    }


RENEWED_STATUS_LABEL = "تمدید شد"


def mark_policy_renewed(
    conn,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    reason: str | None = None,
) -> dict:
    """Mark a policy as renewed (leaves /api/renewals queue). Preserves source_system."""
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    policy_id = str(
        body.get("policyId")
        or body.get("policy_id")
        or body.get("id")
        or ""
    ).strip()
    if not policy_id:
        return {"ok": False, "error": "policyId الزامی است"}
    actor = performed_by or str(body.get("performedBy") or body.get("by") or "").strip() or None
    note_extra = str(body.get("note") or "").strip()
    stamp = today_jalali_text()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, policy_number, computer_code, status, holder_code, source_system, end_date
              FROM policies
             WHERE BTRIM(CAST(id AS TEXT)) = %s
             LIMIT 1
            """,
            (policy_id,),
        )
        row = cur.fetchone()
    if not row:
        return {"ok": False, "error": "بیمه‌نامه یافت نشد", "code": "not_found"}
    row = dict(row)
    old_status = str(row.get("status") or "")
    if RENEWED_STATUS_LABEL in old_status:
        return {
            "ok": True,
            "updated": False,
            "alreadyRenewed": True,
            "policy": {
                "id": str(row.get("id")),
                "number": str(row.get("policy_number") or ""),
                "status": old_status,
                "sourceSystem": str(row.get("source_system") or ""),
            },
            "sourceSystemPreserved": str(row.get("source_system") or ""),
        }

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE policies
               SET status = %s
             WHERE BTRIM(CAST(id AS TEXT)) = %s
             RETURNING id, policy_number, computer_code, status, holder_code, source_system, end_date
            """,
            (RENEWED_STATUS_LABEL, policy_id),
        )
        updated = cur.fetchone()
        if not updated:
            return {"ok": False, "error": "ثبت تمدید ناموفق"}
        updated = dict(updated)
        old_snap = {
            "id": str(row.get("id")),
            "status": old_status,
            "sourceSystem": str(row.get("source_system") or ""),
        }
        new_snap = {
            "id": str(updated.get("id")),
            "status": str(updated.get("status") or ""),
            "sourceSystem": str(updated.get("source_system") or ""),
            "renewedAtJalali": stamp,
            "note": note_extra or None,
            "by": actor,
        }
        audit = insert_audit_log(
            conn,
            table_name="policies",
            record_id=str(updated.get("id")),
            action="UPDATE",
            old_data=old_snap,
            new_data=new_snap,
            changed_fields={
                "status": {"old": old_status, "new": RENEWED_STATUS_LABEL},
            },
            performed_by=actor,
            client_ip=client_ip,
            user_agent=user_agent,
            reason=reason or "renewal_marked",
            source="api",
        )
    return {
        "ok": True,
        "updated": True,
        "policy": {
            "id": str(updated.get("id")),
            "number": str(updated.get("policy_number") or ""),
            "computerCode": str(updated.get("computer_code") or ""),
            "status": str(updated.get("status") or ""),
            "holderCode": str(updated.get("holder_code") or ""),
            "endDate": str(updated.get("end_date") or ""),
            "sourceSystem": str(updated.get("source_system") or ""),
        },
        "audit": audit,
        "sourceSystemPreserved": str(updated.get("source_system") or ""),
    }


# ==============================================================================
# NEW FEATURE 2: Transactional Policy Transfer (جابه‌جایی بیمه‌نامه و پرونده)
# ==============================================================================
def transfer_policy(
    conn,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """Transfer policy + installments + documents to a target policyholder_code."""
    ensure_operational_tables(conn)
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}

    policy_id = to_en_digits(body.get("policyId") or body.get("policy_id") or body.get("id") or "").strip()
    to_code = to_en_digits(
        body.get("toPolicyholderCode")
        or body.get("to_policyholder_code")
        or body.get("toHolderCode")
        or body.get("toCustomerId")
        or ""
    ).strip()
    reason = str(body.get("reason") or "").strip()
    actor = performed_by or str(body.get("performedBy") or "").strip() or "system"

    if not policy_id:
        return {"ok": False, "error": "شناسه یا شماره بیمه‌نامه (policyId) الزامی است"}
    if not to_code:
        return {"ok": False, "error": "کد بیمه‌گذار مقصد (toPolicyholderCode) الزامی است"}
    if not reason:
        return {"ok": False, "error": "ذکر علت جابه‌جایی پرونده الزامی است"}

    target_cust = fetch_customer_by_policyholder_code(conn, to_code)
    if not target_cust:
        return {"ok": False, "error": "بیمه‌گذار مقصد در سیستم یافت نشد", "code": "not_found"}

    canonical_to_code = str(target_cust.get("holder_code") or target_cust.get("id") or to_code).strip()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, policy_number, computer_code, status, holder_code, source_system
              FROM policies
             WHERE BTRIM(CAST(id AS TEXT)) = %s
                OR BTRIM(COALESCE(policy_number, '')) = %s
             LIMIT 1
            """,
            (policy_id, policy_id),
        )
        pol = cur.fetchone()
        if not pol:
            return {"ok": False, "error": "بیمه‌نامه یافت نشد", "code": "not_found"}
        pol = dict(pol)
        actual_pid = str(pol.get("id"))
        pol_num = str(pol.get("policy_number") or "")
        from_code = str(pol.get("holder_code") or "").strip()

        if from_code == canonical_to_code:
            return {"ok": False, "error": "بیمه‌گذار مبدا و مقصد یکسان هستند"}

        # ۱. انتقال بیمه‌نامه (حفظ source_system)
        cur.execute(
            """
            UPDATE policies
               SET holder_code = %s
             WHERE BTRIM(CAST(id AS TEXT)) = %s
         RETURNING id, policy_number, computer_code, status, holder_code, source_system
            """,
            (canonical_to_code, actual_pid),
        )
        updated_pol = dict(cur.fetchone() or {})

        # ۲. انتقال اقساط مرتبط با این بیمه‌نامه
        if pol_num:
            cur.execute(
                """
                UPDATE installments
                   SET holder_code = %s
                 WHERE BTRIM(COALESCE(policy_number, '')) = %s
                """,
                (canonical_to_code, pol_num),
            )
            # ۳. انتقال مدارک مرتبط با این بیمه‌نامه
            cur.execute(
                """
                UPDATE customer_documents
                   SET policyholder_code = %s
                 WHERE BTRIM(COALESCE(policy_number, '')) = %s
                   AND deleted_at IS NULL
                """,
                (canonical_to_code, pol_num),
            )

        # ۴. ثبت در جدول انتقال‌ها
        cur.execute(
            """
            INSERT INTO policy_transfers (
              policy_id, policy_number, from_holder_code, to_holder_code, reason, status, performed_by
            ) VALUES (%s, %s, %s, %s, %s, 'completed', %s)
            RETURNING id, created_at
            """,
            (actual_pid, pol_num, from_code, canonical_to_code, reason, actor),
        )
        tr_row = dict(cur.fetchone() or {})

        # ۵. ثبت در لاگ حسابرسی
        audit = insert_audit_log(
            conn,
            table_name="policies",
            record_id=actual_pid,
            action="UPDATE",
            old_data={"id": actual_pid, "policyNumber": pol_num, "holderCode": from_code},
            new_data={
                "id": actual_pid,
                "policyNumber": pol_num,
                "holderCode": canonical_to_code,
                "transferId": tr_row.get("id"),
            },
            changed_fields={"holder_code": {"old": from_code, "new": canonical_to_code}},
            performed_by=actor,
            client_ip=client_ip,
            user_agent=user_agent,
            reason=f"policy_transfer: {reason}",
            source="api",
        )

    return {
        "ok": True,
        "transfer": {
            "id": tr_row.get("id"),
            "policyId": actual_pid,
            "policyNumber": pol_num,
            "fromPolicyholderCode": from_code,
            "toPolicyholderCode": canonical_to_code,
            "reason": reason,
            "createdAt": str(tr_row.get("created_at") or ""),
        },
        "policy": updated_pol,
        "audit": audit,
    }


# ==============================================================================
# NEW FEATURE 3: Dossier 365 (پرونده ۳۶۵ جامع مشتری)
# ==============================================================================
def get_dossier_365(conn, policyholder_code: str) -> dict:
    """Aggregate Customer + Policies + Installments + Documents + SMS + Urgent Tasks + Audit."""
    ensure_operational_tables(conn)
    cust = fetch_customer_by_policyholder_code(conn, policyholder_code)
    if not cust:
        return {"ok": False, "error": "بیمه‌گذار یافت نشد", "code": "not_found"}

    code = str(cust.get("holder_code") or cust.get("id") or policyholder_code).strip()
    with conn.cursor() as cur:
        # دریافت یا ساخت پرونده ۳۶۵
        cur.execute(
            "SELECT id, policyholder_code, dossier_number, case_365, updated_at FROM customer_dossiers WHERE policyholder_code = %s LIMIT 1",
            (code,),
        )
        dos = cur.fetchone()
        if not dos:
            d_num = f"D365-{code}"
            cur.execute(
                """
                INSERT INTO customer_dossiers (policyholder_code, dossier_number, case_365)
                VALUES (%s, %s, '{}'::jsonb)
                RETURNING id, policyholder_code, dossier_number, case_365, updated_at
                """,
                (code, d_num),
            )
            dos = cur.fetchone()
        dos = dict(dos or {})

        # بیمه‌نامه‌ها
        cur.execute(
            """
            SELECT id, policy_number, computer_code, status, holder_code, source_system, end_date
              FROM policies
             WHERE BTRIM(COALESCE(holder_code, '')) = %s
             ORDER BY id DESC
            """,
            (code,),
        )
        policies = [dict(r) for r in (cur.fetchall() or [])]

        # اقساط
        cur.execute(
            """
            SELECT id, amount, paid_amount, paid_date, payment_method, status,
                   holder_code, source_system, due_date, policy_number
              FROM installments
             WHERE BTRIM(COALESCE(holder_code, '')) = %s
             ORDER BY due_date ASC
            """,
            (code,),
        )
        installments = [dict(r) for r in (cur.fetchall() or [])]

        # پیامک‌ها
        cur.execute(
            "SELECT id, recipient, body, status, policy_number, performed_by, created_at FROM sms_messages WHERE policyholder_code = %s ORDER BY created_at DESC LIMIT 50",
            (code,),
        )
        sms_list = [dict(r) for r in (cur.fetchall() or [])]

        # کارهای فوری
        cur.execute(
            "SELECT id, title, description, status, priority, policy_number, created_at FROM urgent_tasks WHERE policyholder_code = %s ORDER BY created_at DESC LIMIT 50",
            (code,),
        )
        tasks = [dict(r) for r in (cur.fetchall() or [])]

    docs_res = list_customer_documents(conn, {"policyholderCode": code})
    audits_res = list_audit_logs(conn, {"record_id": code, "limit": "50"})

    return {
        "ok": True,
        "dossier": {
            "id": dos.get("id"),
            "policyholderCode": code,
            "dossierNumber": dos.get("dossier_number"),
            "case_365": dos.get("case_365") or {},
            "updatedAt": str(dos.get("updated_at") or ""),
        },
        "customer": _customer_row_public(cust),
        "policies": policies,
        "installments": installments,
        "documents": docs_res.get("items", []),
        "smsHistory": sms_list,
        "urgentTasks": tasks,
        "auditTrail": audits_res.get("items", []),
    }


def update_dossier_365(
    conn,
    policyholder_code: str,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """Merge JSON fields into customer_dossiers.case_365 and log to audit_logs."""
    ensure_operational_tables(conn)
    code = to_en_digits(policyholder_code).strip()
    if not code:
        return {"ok": False, "error": "کد بیمه‌گذار الزامی است"}

    incoming = body.get("case_365") if isinstance(body.get("case_365"), dict) else body.get("fields")
    if not isinstance(incoming, dict):
        incoming = {k: v for k, v in body.items() if k not in {"performedBy", "reason"}}

    with conn.cursor() as cur:
        cur.execute("SELECT id, case_365 FROM customer_dossiers WHERE policyholder_code = %s LIMIT 1", (code,))
        row = cur.fetchone()
        old_case = dict(row["case_365"]) if row and isinstance(row.get("case_365"), dict) else {}
        new_case = {**old_case, **incoming}

        if not row:
            cur.execute(
                """
                INSERT INTO customer_dossiers (policyholder_code, dossier_number, case_365, updated_by)
                VALUES (%s, %s, %s::jsonb, %s)
                RETURNING id, policyholder_code, dossier_number, case_365, updated_at
                """,
                (code, f"D365-{code}", _json_dumps(new_case) or "{}", performed_by),
            )
        else:
            cur.execute(
                """
                UPDATE customer_dossiers
                   SET case_365 = %s::jsonb, updated_by = %s, updated_at = NOW()
                 WHERE policyholder_code = %s
             RETURNING id, policyholder_code, dossier_number, case_365, updated_at
                """,
                (_json_dumps(new_case) or "{}", performed_by, code),
            )
        updated = dict(cur.fetchone() or {})
        audit = insert_audit_log(
            conn,
            table_name="customer_dossiers",
            record_id=code,
            action="UPDATE",
            old_data=old_case,
            new_data=new_case,
            changed_fields=list(incoming.keys()),
            performed_by=performed_by,
            client_ip=client_ip,
            user_agent=user_agent,
            reason="dossier_365_update",
            source="api",
        )
    return {"ok": True, "dossier": updated, "audit": audit}


# ==============================================================================
# NEW FEATURE 4: Persistent SMS & Urgent Tasks in PostgreSQL
# ==============================================================================
def create_persistent_sms_and_task(
    conn,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """Save outbound SMS and optional Urgent Task directly in PostgreSQL."""
    ensure_operational_tables(conn)
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}

    recipient = normalize_mobile(body.get("recipient") or body.get("mobile") or body.get("phone") or "")
    text_body = str(body.get("body") or body.get("message") or "").strip()
    ph = to_en_digits(body.get("policyholderCode") or body.get("holderCode") or body.get("customerId") or "").strip() or None
    pol_num = str(body.get("policyNumber") or body.get("policyId") or "").strip() or None
    actor = performed_by or str(body.get("performedBy") or "").strip() or "system"

    if not recipient or not text_body:
        return {"ok": False, "error": "شماره گیرنده و متن پیامک الزامی است"}

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sms_messages (recipient, body, status, policyholder_code, policy_number, performed_by)
            VALUES (%s, %s, 'sent', %s, %s, %s)
            RETURNING id, recipient, body, status, policyholder_code, policy_number, created_at
            """,
            (recipient, text_body, ph, pol_num, actor),
        )
        sms_row = dict(cur.fetchone() or {})
        insert_audit_log(
            conn,
            table_name="sms_messages",
            record_id=str(sms_row.get("id")),
            action="INSERT",
            new_data=sms_row,
            performed_by=actor,
            client_ip=client_ip,
            user_agent=user_agent,
            reason="sms_send",
        )

        task_row = None
        if body.get("createUrgentTask") or body.get("taskTitle"):
            t_title = str(body.get("taskTitle") or f"پیگیری پیامک به {recipient}").strip()
            cur.execute(
                """
                INSERT INTO urgent_tasks (title, description, status, priority, policyholder_code, policy_number, created_by)
                VALUES (%s, %s, 'pending', 'high', %s, %s, %s)
                RETURNING id, title, description, status, priority, policyholder_code, created_at
                """,
                (t_title, text_body, ph, pol_num, actor),
            )
            task_row = dict(cur.fetchone() or {})
            insert_audit_log(
                conn,
                table_name="urgent_tasks",
                record_id=str(task_row.get("id")),
                action="INSERT",
                new_data=task_row,
                performed_by=actor,
                client_ip=client_ip,
                user_agent=user_agent,
                reason="urgent_task_from_sms",
            )

    return {"ok": True, "sms": sms_row, "urgentTask": task_row}


def _safe_filename(name: str) -> str:
    base = SAFE_FILENAME_RE.sub("_", (name or "file").strip()) or "file"
    return base[:180]


def _storage_rel_path(policyholder_code: str | None, sha256: str, filename: str) -> str:
    now = datetime.now(timezone.utc)
    folder = (policyholder_code or "orphan").strip() or "orphan"
    folder = SAFE_FILENAME_RE.sub("_", folder)[:64]
    prefix = sha256[:8]
    return f"{folder}/{now.year:04d}/{now.month:02d}/{prefix}/{_safe_filename(filename)}"


def create_customer_document(
    conn,
    body: dict,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    root: Path | None = None,
) -> dict:
    """POST document meta + file bytes (base64). Writes under DOCUMENTS_ROOT."""
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    category = str(body.get("category") or "").strip()
    file_title = str(body.get("fileTitle") or body.get("file_title") or body.get("title") or "").strip()
    mime_type = str(body.get("mimeType") or body.get("mime_type") or "application/octet-stream").strip()
    if not category:
        return {"ok": False, "error": "category الزامی است"}
    if not file_title:
        return {"ok": False, "error": "fileTitle الزامی است"}

    content_b64 = body.get("contentBase64") or body.get("content_base64") or body.get("fileBase64")
    raw_bytes: bytes | None = None
    if isinstance(content_b64, str) and content_b64.strip():
        try:
            raw_bytes = base64.b64decode(content_b64, validate=False)
        except Exception:
            return {"ok": False, "error": "contentBase64 نامعتبر"}
    elif isinstance(body.get("contentBytes"), (bytes, bytearray)):
        raw_bytes = bytes(body["contentBytes"])
    if raw_bytes is None:
        return {"ok": False, "error": "محتوای فایل (contentBase64) الزامی است"}
    if len(raw_bytes) > 25 * 1024 * 1024:
        return {"ok": False, "error": "حجم فایل بیش از ۲۵ مگابایت"}

    sha = hashlib.sha256(raw_bytes).hexdigest()
    ph = str(
        body.get("policyholderCode")
        or body.get("policyholder_code")
        or body.get("holderCode")
        or body.get("holder_code")
        or ""
    ).strip() or None
    filename = str(body.get("filename") or body.get("fileName") or file_title).strip() or "file.bin"
    rel = _storage_rel_path(ph, sha, filename)
    root_path = root or documents_root()
    abs_path = root_path / rel
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(raw_bytes)

    national_id = str(body.get("nationalId") or body.get("national_id") or "").strip() or None
    policy_number = str(body.get("policyNumber") or body.get("policy_number") or "").strip() or None
    computer_code = str(body.get("computerCode") or body.get("computer_code") or "").strip() or None
    installment_key = str(body.get("installmentKey") or body.get("installment_key") or "").strip() or None
    uploaded_by = performed_by or str(body.get("uploadedBy") or body.get("uploaded_by") or "").strip() or None
    case_365 = body.get("case_365") if isinstance(body.get("case_365"), dict) else {}
    source_system = str(body.get("sourceSystem") or body.get("source_system") or "fasihicrm").strip() or "fasihicrm"

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO customer_documents (
              policyholder_code, national_id, policy_number, computer_code,
              installment_key, category, file_title, storage_path, mime_type,
              file_size_bytes, sha256_checksum, uploaded_by, source_system, case_365
            ) VALUES (
              %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s::jsonb
            )
            RETURNING id, policyholder_code, category, file_title, storage_path,
                      mime_type, file_size_bytes, sha256_checksum, uploaded_by,
                      source_system, created_at, national_id, policy_number
            """,
            (
                ph,
                national_id,
                policy_number,
                computer_code,
                installment_key,
                category,
                file_title,
                rel,
                mime_type,
                len(raw_bytes),
                sha,
                uploaded_by,
                source_system,
                _json_dumps(case_365) or "{}",
            ),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "ثبت سند ناموفق"}
        row = dict(row)
        audit = insert_audit_log(
            conn,
            table_name="customer_documents",
            record_id=str(row.get("id")),
            action="INSERT",
            old_data=None,
            new_data={
                "id": row.get("id"),
                "policyholderCode": row.get("policyholder_code"),
                "category": row.get("category"),
                "fileTitle": row.get("file_title"),
                "storagePath": row.get("storage_path"),
                "sha256": row.get("sha256_checksum"),
            },
            changed_fields=None,
            performed_by=uploaded_by,
            client_ip=client_ip,
            user_agent=user_agent,
            reason="document_upload",
            source="api",
        )
    return {
        "ok": True,
        "document": _document_public(row),
        "audit": audit,
    }


def _document_public(row: dict) -> dict:
    deleted = row.get("deleted_at")
    return {
        "id": row.get("id"),
        "policyholderCode": row.get("policyholder_code"),
        "nationalId": row.get("national_id"),
        "policyNumber": row.get("policy_number"),
        "computerCode": row.get("computer_code"),
        "installmentKey": row.get("installment_key"),
        "category": row.get("category"),
        "fileTitle": row.get("file_title"),
        "storagePath": row.get("storage_path"),
        "mimeType": row.get("mime_type"),
        "fileSizeBytes": row.get("file_size_bytes"),
        "sha256": row.get("sha256_checksum"),
        "uploadedBy": row.get("uploaded_by"),
        "sourceSystem": row.get("source_system"),
        "createdAt": str(row.get("created_at") or ""),
        "deletedAt": str(deleted) if deleted else None,
    }


def list_customer_documents(conn, query: dict | None = None) -> dict:
    ph = _qget(query, "policyholder_code") or _qget(query, "policyholderCode") or _qget(query, "holderCode")
    policy = _qget(query, "policy_number") or _qget(query, "policyNumber")
    nid = _qget(query, "national_id") or _qget(query, "nationalId")
    include_deleted = str(_qget(query, "includeDeleted") or _qget(query, "include_deleted") or "").lower() in {
        "1", "true", "yes",
    }
    limit = 100
    raw_limit = _qget(query, "limit")
    if raw_limit:
        try:
            limit = max(1, min(500, int(raw_limit)))
        except ValueError:
            limit = 100
    clauses = ["1=1"]
    params: list[Any] = []
    if ph:
        clauses.append("BTRIM(COALESCE(policyholder_code, '')) = %s")
        params.append(ph)
    if policy:
        clauses.append("BTRIM(COALESCE(policy_number, '')) = %s")
        params.append(policy)
    if nid:
        clauses.append("BTRIM(COALESCE(national_id, '')) = %s")
        params.append(nid)
    if not include_deleted:
        clauses.append("deleted_at IS NULL")
    params.append(limit)
    sql = f"""
        SELECT id, policyholder_code, national_id, policy_number, computer_code,
               installment_key, category, file_title, storage_path, mime_type,
               file_size_bytes, sha256_checksum, uploaded_by, source_system, created_at,
               deleted_at
          FROM customer_documents
         WHERE {' AND '.join(clauses)}
         ORDER BY created_at DESC
         LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []
    items = [_document_public(dict(r)) for r in rows]
    return {"ok": True, "items": items, "count": len(items)}


def get_customer_document(conn, doc_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, policyholder_code, national_id, policy_number, computer_code,
                   installment_key, category, file_title, storage_path, mime_type,
                   file_size_bytes, sha256_checksum, uploaded_by, source_system, created_at,
                   deleted_at
              FROM customer_documents
             WHERE id = %s
             LIMIT 1
            """,
            (doc_id,),
        )
        row = cur.fetchone()
    if not row:
        return {"ok": False, "error": "سند یافت نشد", "code": "not_found"}
    return {"ok": True, "document": _document_public(dict(row))}


def resolve_document_file(conn, doc_id: str, *, root: Path | None = None) -> dict:
    meta = get_customer_document(conn, doc_id)
    if not meta.get("ok"):
        return meta
    doc = meta["document"]
    rel = str(doc.get("storagePath") or "")
    if not rel or ".." in rel.split("/"):
        return {"ok": False, "error": "مسیر فایل نامعتبر"}
    abs_path = (root or documents_root()) / rel
    if not abs_path.is_file():
        return {"ok": False, "error": "فایل روی دیسک یافت نشد", "code": "file_missing", "document": doc}
    return {
        "ok": True,
        "document": doc,
        "_file": str(abs_path),
        "mime": doc.get("mimeType") or "application/octet-stream",
        "filename": Path(rel).name,
    }


def soft_delete_customer_document(
    conn,
    doc_id: str,
    *,
    performed_by: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    reason: str | None = None,
) -> dict:
    """Soft-delete: set deleted_at. Never DROP file or hard-DELETE the row."""
    doc_id = str(doc_id or "").strip()
    if not doc_id:
        return {"ok": False, "error": "شناسه سند الزامی است"}
    meta = get_customer_document(conn, doc_id)
    if not meta.get("ok"):
        return meta
    doc = meta["document"]
    if doc.get("deletedAt"):
        return {"ok": True, "updated": False, "document": doc, "message": "قبلاً حذف نرم شده"}
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE customer_documents
               SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = %s AND deleted_at IS NULL
         RETURNING id, policyholder_code, national_id, policy_number, computer_code,
                   installment_key, category, file_title, storage_path, mime_type,
                   file_size_bytes, sha256_checksum, uploaded_by, source_system, created_at,
                   deleted_at
            """,
            (doc_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"ok": False, "error": "حذف نرم ناموفق", "code": "not_found"}
        row = dict(row)
        audit = insert_audit_log(
            conn,
            table_name="customer_documents",
            record_id=str(row.get("id")),
            action="DELETE",
            old_data={"id": doc.get("id"), "deletedAt": None},
            new_data={"id": row.get("id"), "deletedAt": str(row.get("deleted_at") or "")},
            changed_fields=["deleted_at"],
            performed_by=performed_by,
            client_ip=client_ip,
            user_agent=user_agent,
            reason=reason or "document_soft_delete",
            source="api",
        )
    return {"ok": True, "updated": True, "document": _document_public(row), "audit": audit}


def _parse_nested_customer_documents(path: str) -> tuple[str | None, str | None, bool]:
    """Parse /api/customers/{key}/documents[/{id}[/file]]."""
    prefix = "/api/customers/"
    if not path.startswith(prefix):
        return None, None, False
    rest = path[len(prefix) :]
    if "/documents" not in rest:
        return None, None, False
    key, _, after = rest.partition("/documents")
    key = unquote(key).strip().strip("/")
    if not key or "/" in key:
        return None, None, False
    after = after.strip("/")
    if not after:
        return key, None, False
    parts = [unquote(p).strip() for p in after.split("/") if p.strip()]
    if not parts:
        return key, None, False
    doc_id = parts[0]
    wants_file = len(parts) >= 2 and parts[1] == "file"
    return key, doc_id, wants_file


def list_audit_logs(conn, query: dict | None = None) -> dict:
    table = _qget(query, "table") or _qget(query, "table_name") or _qget(query, "tableName")
    record_id = _qget(query, "record_id") or _qget(query, "recordId")
    actor = _qget(query, "performed_by") or _qget(query, "performedBy") or _qget(query, "actor")
    limit = 100
    raw_limit = _qget(query, "limit")
    if raw_limit:
        try:
            limit = max(1, min(500, int(raw_limit)))
        except ValueError:
            limit = 100
    clauses = ["1=1"]
    params: list[Any] = []
    if table:
        clauses.append("table_name = %s")
        params.append(table)
    if record_id:
        clauses.append("record_id = %s")
        params.append(record_id)
    if actor:
        clauses.append("performed_by = %s")
        params.append(actor)
    params.append(limit)
    sql = f"""
        SELECT id, table_name, record_id, action, old_data, new_data, changed_fields,
               performed_by, client_ip, user_agent, reason, source, created_at
          FROM audit_logs
         WHERE {' AND '.join(clauses)}
         ORDER BY created_at DESC
         LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []
    items = []
    for r in rows:
        row = dict(r)
        items.append(
            {
                "id": row.get("id"),
                "tableName": row.get("table_name"),
                "recordId": row.get("record_id"),
                "action": row.get("action"),
                "oldData": row.get("old_data"),
                "newData": row.get("new_data"),
                "changedFields": row.get("changed_fields"),
                "performedBy": row.get("performed_by"),
                "clientIp": row.get("client_ip"),
                "userAgent": row.get("user_agent"),
                "reason": row.get("reason"),
                "source": row.get("source"),
                "createdAt": str(row.get("created_at") or ""),
                "actor": row.get("performed_by") or "سیستم",
                "entity": f"{row.get('table_name')}:{row.get('record_id')}",
                "ip": row.get("client_ip") or "",
                "date": str(row.get("created_at") or ""),
            }
        )
    return {"ok": True, "items": items, "count": len(items)}


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
    conn=None,
    *,
    client_ip: str | None = None,
    user_agent: str | None = None,
    performed_by: str | None = None,
    root: Path | None = None,
) -> tuple[int, dict]:
    """Route helper for app.py — returns (status, payload)."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    meta = {
        "performed_by": performed_by or body.get("performedBy") or body.get("uploadedBy"),
        "client_ip": client_ip,
        "user_agent": user_agent,
    }

    if conn is None:
        return 503, {"ok": False, "error": "اتصال پایگاه‌داده در دسترس نیست", "code": "no_db"}

    # --- Nested handoff aliases: /api/customers/{key}/documents ---
    nest_key, nest_doc_id, nest_file = _parse_nested_customer_documents(path)
    if nest_key is not None:
        if method == "GET" and nest_doc_id is None:
            q = dict(query or {})
            q["policyholderCode"] = [nest_key]
            return 200, list_customer_documents(conn, q)
        if method == "GET" and nest_doc_id and nest_file:
            result = resolve_document_file(conn, nest_doc_id, root=root)
            code = 200 if result.get("ok") else (404 if result.get("code") in {"not_found", "file_missing"} else 400)
            return code, result
        if method == "GET" and nest_doc_id:
            result = get_customer_document(conn, nest_doc_id)
            return (200 if result.get("ok") else 404), result
        if method == "POST" and nest_doc_id is None:
            body = {**body, "policyholderCode": body.get("policyholderCode") or nest_key}
            result = create_customer_document(
                conn,
                body,
                performed_by=meta["performed_by"],
                client_ip=client_ip,
                user_agent=user_agent,
                root=root,
            )
            return (200 if result.get("ok") else 400), result
        if method == "DELETE" and nest_doc_id:
            result = soft_delete_customer_document(
                conn,
                nest_doc_id,
                performed_by=meta["performed_by"],
                client_ip=client_ip,
                user_agent=user_agent,
            )
            code = 200 if result.get("ok") else (404 if result.get("code") == "not_found" else 400)
            return code, result
        return 404, {"ok": False, "error": "not found"}

    # --- NEW: GET / POST /api/dossiers/{policyholder_code} (پرونده ۳۶۵) ---
    if path.startswith("/api/dossiers/"):
        key = unquote(path[len("/api/dossiers/") :]).strip().strip("/")
        if method == "GET":
            res = get_dossier_365(conn, key)
            return (200 if res.get("ok") else 404), res
        if method in ("POST", "PATCH"):
            res = update_dossier_365(
                conn,
                key,
                body,
                performed_by=meta["performed_by"],
                client_ip=client_ip,
                user_agent=user_agent,
            )
            return (200 if res.get("ok") else 400), res

    # --- NEW: POST /api/policies/transfer (جابه‌جایی بیمه‌نامه) ---
    if method == "POST" and path == "/api/policies/transfer":
        res = transfer_policy(
            conn,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        code = 200 if res.get("ok") else (404 if res.get("code") == "not_found" else 400)
        return code, res

    # --- NEW: POST /api/persist/sms (ثبت پیامک و کار فوری در دیتابیس) ---
    if method == "POST" and path in ("/api/persist/sms", "/api/sms/persist"):
        res = create_persistent_sms_and_task(
            conn,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        return (200 if res.get("ok") else 400), res

    # GET /api/audit
    if method == "GET" and path == "/api/audit":
        return 200, list_audit_logs(conn, query)

    # GET /api/customer-documents
    if method == "GET" and path == "/api/customer-documents":
        return 200, list_customer_documents(conn, query)

    # GET /api/customer-documents/{id}/file
    if method == "GET" and path.startswith("/api/customer-documents/") and path.endswith("/file"):
        doc_id = unquote(path[len("/api/customer-documents/") : -len("/file")]).strip().strip("/")
        result = resolve_document_file(conn, doc_id, root=root)
        code = 200 if result.get("ok") else (404 if result.get("code") in {"not_found", "file_missing"} else 400)
        return code, result

    # GET /api/customer-documents/{id}
    if method == "GET" and path.startswith("/api/customer-documents/"):
        doc_id = unquote(path[len("/api/customer-documents/") :]).strip()
        result = get_customer_document(conn, doc_id)
        return (200 if result.get("ok") else 404), result

    # POST /api/customer-documents
    if method == "POST" and path == "/api/customer-documents":
        result = create_customer_document(
            conn,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
            root=root,
        )
        return (200 if result.get("ok") else 400), result

    # DELETE /api/customer-documents/{id} — soft-delete only
    if method == "DELETE" and path.startswith("/api/customer-documents/"):
        doc_id = unquote(path[len("/api/customer-documents/") :]).strip().strip("/")
        if not doc_id or "/" in doc_id:
            return 404, {"ok": False, "error": "not found"}
        result = soft_delete_customer_document(
            conn,
            doc_id,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        code = 200 if result.get("ok") else (404 if result.get("code") == "not_found" else 400)
        return code, result

    # POST /api/installments/payment  OR  /api/installments/{id}/payments
    if method == "POST" and (
        path == "/api/installments/payment"
        or path == "/api/installments/payments"
        or (path.startswith("/api/installments/") and path.endswith("/payments"))
    ):
        if path.endswith("/payments") and path != "/api/installments/payments":
            mid = unquote(path[len("/api/installments/") : -len("/payments")]).strip()
            if mid and "installmentId" not in body and "id" not in body:
                body = {**body, "installmentId": mid}
        result = register_installment_payment(
            conn,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        code = 200 if result.get("ok") else (404 if result.get("code") == "not_found" else 400)
        return code, result

    # POST /api/renewals/mark  OR  /api/policies/renewed  OR  /api/policies/{id}/renewed
    if method == "POST" and (
        path in ("/api/renewals/mark", "/api/renewals/renewed", "/api/policies/renewed")
        or (path.startswith("/api/policies/") and path.endswith("/renewed"))
    ):
        if path.endswith("/renewed") and path not in ("/api/policies/renewed", "/api/renewals/renewed"):
            mid = unquote(path[len("/api/policies/") : -len("/renewed")]).strip()
            if mid and "policyId" not in body and "id" not in body:
                body = {**body, "policyId": mid}
        result = mark_policy_renewed(
            conn,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        code = 200 if result.get("ok") else (404 if result.get("code") == "not_found" else 400)
        return code, result

    # PATCH /api/customers/{policyholder_code} — never PUT
    if method == "PATCH" and path.startswith("/api/customers/"):
        key = unquote(path[len("/api/customers/") :]).strip()
        if "/" in key:
            return 404, {"ok": False, "error": "not found"}
        result = patch_customer_by_policyholder_code(
            conn,
            key,
            body,
            performed_by=meta["performed_by"],
            client_ip=client_ip,
            user_agent=user_agent,
        )
        code = 200 if result.get("ok") else (404 if result.get("code") == "not_found" else 400)
        return code, result

    # GET /api/persist/meta
    if method == "GET" and path in ("/api/persist/meta", "/api/persist"):
        return 200, {
            "ok": True,
            "module": MODULE,
            "label": MODULE_LABEL,
            "documentsRoot": str(root or documents_root()),
            "endpoints": [
                "PATCH /api/customers/{policyholder_code}",
                "POST /api/installments/payment",
                "POST /api/renewals/mark",
                "POST /api/policies/transfer",
                "GET|POST /api/dossiers/{policyholder_code}",
                "POST /api/persist/sms",
                "POST /api/customer-documents",
                "GET /api/customer-documents",
                "GET /api/customer-documents/{id}",
                "GET /api/customer-documents/{id}/file",
                "DELETE /api/customer-documents/{id} (soft)",
                "GET|POST /api/customers/{key}/documents",
                "DELETE /api/customers/{key}/documents/{id} (soft)",
                "GET /api/audit",
            ],
            "locks": {
                "source_system": "preserved",
                "case_365": "untouched",
                "hard_delete": "forbidden",
                "customer_write": "PATCH_only",
                "jalali": "TEXT yyyy/mm/dd",
            },
        }

    return 404, {"ok": False, "error": "not found"}