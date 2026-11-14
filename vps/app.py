#!/usr/bin/env python3
"""Fasihi real-data API — stdlib HTTP + psycopg."""
from __future__ import annotations

import gzip
import json
import os
import re
import socket
import time
import traceback
import urllib.error
import urllib.request
from collections import deque
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import psycopg
from psycopg.rows import dict_row

try:
    import sms_panel
except ImportError:
    from vps import sms_panel  # type: ignore

try:
    import sales_network
except ImportError:
    from vps import sales_network  # type: ignore

try:
    import sima_zar
except ImportError:
    from vps import sima_zar  # type: ignore

try:
    import omid_pension
except ImportError:
    from vps import omid_pension  # type: ignore

try:
    import group_health
except ImportError:
    from vps import group_health  # type: ignore

try:
    import sanhab
except ImportError:
    from vps import sanhab  # type: ignore

try:
    import dms
except ImportError:
    from vps import dms  # type: ignore

try:
    import loyalty
except ImportError:
    from vps import loyalty  # type: ignore

try:
    import branch_ops
except ImportError:
    from vps import branch_ops  # type: ignore

try:
    import persist
except ImportError:
    from vps import persist  # type: ignore

try:
    import documents as documents_module
except ImportError:
    try:
        from vps import documents as documents_module  # type: ignore
    except ImportError:
        documents_module = None  # type: ignore


def _dms_files_customer_key(body=None, qs=None):
    """Resolve archive customer key from DMS file request (C-K preferred)."""
    body = body if isinstance(body, dict) else {}
    qs = qs if isinstance(qs, dict) else {}

    def _first(*vals):
        for v in vals:
            if v is None:
                continue
            if isinstance(v, list):
                v = v[0] if v else None
            s = str(v or "").strip()
            if s:
                return s
        return ""

    key = _first(
        body.get("customerId"),
        body.get("customer_id"),
        body.get("policyholderCode"),
        body.get("policyholder_code"),
        body.get("dossierKey"),
        body.get("dossier_key"),
        (qs.get("customerId") or [None])[0] if qs else None,
        (qs.get("customer_id") or [None])[0] if qs else None,
        (qs.get("policyholderCode") or [None])[0] if qs else None,
        (qs.get("policyholder_code") or [None])[0] if qs else None,
        (qs.get("dossierKey") or [None])[0] if qs else None,
        (qs.get("dossier_key") or [None])[0] if qs else None,
    )
    return key


def _normalize_document_upload_body(body: dict) -> dict:
    out = dict(body)
    if "content" not in out and "base64" not in out:
        if out.get("contentBase64"):
            out["content"] = out.get("contentBase64")
    if "title" not in out and out.get("fileTitle"):
        out["title"] = out.get("fileTitle")
    if "fileName" not in out and out.get("filename"):
        out["fileName"] = out.get("filename")
    return out


try:
    from bimebazar_client import (
        bimebazar_status_public,
        quote_premium,
    )
except ImportError:
    from vps.bimebazar_client import (  # type: ignore
        bimebazar_status_public,
        quote_premium,
    )

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://fasihi@fasihi-db:5432/fasihi",
)
HOST = os.environ.get("API_HOST", "0.0.0.0")
PORT = int(os.environ.get("API_PORT", "8088"))
WRITE_CHUNK = 64 * 1024
GZIP_LEVEL = 4

IRANPAYAMAK_DEFAULT_BASE = "https://api.iranpayamak.com"
SMS_ENV_ERROR = "نیاز به env / API"
PHONE_RE = re.compile(r"^09\d{9}$")
SMS_SEND_LOG: deque[dict] = deque(maxlen=100)

# --- Premium AI (Gemini) — key only from env, never logged ---
# Model id comes from PREMIUM_AI_MODEL (ops lock live to gemini-3.8-flash).
# Optional PREMIUM_AI_MODEL_FALLBACK (e.g. gemini-flash-latest) after 403/404/503/timeout.
# Per-attempt timeout: PREMIUM_AI_TIMEOUT_SEC (default 8, clamp 3–20). Wall target <~15s.
PREMIUM_AI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"
PREMIUM_AI_DEFAULT_MODEL = "gemini-3.8-flash"
PREMIUM_AI_ENV_ERROR = "نیاز به env / API مشاور حق‌بیمه"
PREMIUM_AI_TIMEOUT_ERROR = "پاسخ مشاور به‌موقع نرسید (تایم‌اوت)"
PREMIUM_AI_NETWORK_ERROR = "خطا در ارتباط با سرویس مشاور"
PREMIUM_AI_KEY_403 = "کلید Google محدود/نامعتبر از سرور"
PREMIUM_AI_EGRESS_ERROR = "خروجی سرور به Gemini قطع/کند است (تایم‌اوت/egress)"
PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

POLICY_KIND_ENUM = {
    "عمر و سرمایه‌گذاری",
    "عمر و سرمايه گذاري",
    "درمان",
    "آتش‌سوزی",
    "آتش سوزی",
    "اتومبیل",
    "مسئولیت",
    "مهندسی",
    "باربری",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def accepts_gzip(accept_encoding: str | None) -> bool:
    if not accept_encoding:
        return False
    for part in accept_encoding.split(","):
        token = part.strip().split(";", 1)[0].strip().lower()
        if token == "gzip":
            return True
    return False


def maybe_gzip(body: bytes, accept_encoding: str | None) -> tuple[bytes, str | None]:
    if not accepts_gzip(accept_encoding):
        return body, None
    return gzip.compress(body, compresslevel=GZIP_LEVEL), "gzip"


def to_float(v) -> float:
    if v is None:
        return 0.0
    s = str(v).strip().replace(",", "")
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        m = re.search(r"[-+]?\d*\.?\d+", s)
        return float(m.group(0)) if m else 0.0


def to_int(v, default: int = 0) -> int:
    if v is None:
        return default
    s = str(v).strip()
    if not s:
        return default
    try:
        return int(float(s))
    except ValueError:
        m = re.search(r"\d+", s)
        return int(m.group(0)) if m else default


def as_identifier(v) -> str:
    """Keep identifier text intact (leading zeros). Never pad or invent digits."""
    if v is None:
        return ""
    return str(v)


YMD_RE = re.compile(r"^(\d{4})[/.\\-](\d{1,2})[/.\\-](\d{1,2})(?:[T\s].*)?$")


def to_en_digits(value) -> str:
    """Persian / Arabic-Indic digits → ASCII, so live `۱۴۰۴/۰۴/۱۹` parses."""
    if value is None:
        return ""
    return str(value).translate(PERSIAN_DIGITS)


# «کد N» / Arabic-kaf «كد N» suffix in full_name → policyholder code (not national id).
HOLDER_CODE_FROM_NAME_RE = re.compile(r"[کك]د\s*([0-9]+)")


def extract_holder_code_from_full_name(full_name) -> str:
    """Parse trimmed holder code after کد/كد; Persian/Arabic digits → ASCII. Empty if none."""
    raw = to_en_digits(full_name).strip()
    if not raw:
        return ""
    match = HOLDER_CODE_FROM_NAME_RE.search(raw)
    if not match:
        return ""
    return match.group(1).strip()


def holder_code_is_empty(value) -> bool:
    if value is None:
        return True
    return str(value).strip() == ""


def plan_holder_code_backfill(rows: list[dict]) -> dict:
    """Dry-run plan: only fill empty holder_code from «کد N» in full_name. Never overwrite."""
    would_update: list[dict] = []
    already_set = 0
    empty_no_code = 0
    for r in rows:
        cid = str(r.get("id") or "").strip()
        current = as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode")).strip()
        parsed = extract_holder_code_from_full_name(
            row_get(r, "full_name") or row_get(r, "fullName")
        )
        if not holder_code_is_empty(current):
            already_set += 1
            continue
        if not parsed:
            empty_no_code += 1
            continue
        would_update.append(
            {
                "id": cid,
                "holderCode": parsed,
                "fullName": stringify_cell(row_get(r, "full_name") or row_get(r, "fullName")),
            }
        )
    return {
        "scanned": len(rows),
        "wouldUpdate": len(would_update),
        "alreadySet": already_set,
        "emptyNoCode": empty_no_code,
        "samples": would_update[:20],
        "updates": would_update,
    }


def ensure_customers_holder_code_column(conn) -> None:
    """Idempotent: customers.holder_code TEXT. No wipe / no drop."""
    with conn.cursor() as cur:
        cur.execute(
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS holder_code TEXT"
        )
    conn.commit()


def apply_holder_code_backfill(conn, *, dry_run: bool = True) -> dict:
    """Fill customers.holder_code from full_name «کد N» only where empty.

    Prefer UPDATE … WHERE holder_code IS NULL OR holder_code=''.
    Never overwrite non-empty. Never DELETE / TRUNCATE.
    """
    ensure_customers_holder_code_column(conn)
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
    plan = plan_holder_code_backfill(cust_rows)
    report = {
        "ok": True,
        "dryRun": bool(dry_run),
        "scanned": plan["scanned"],
        "wouldUpdate": plan["wouldUpdate"],
        "updated": 0,
        "alreadySet": plan["alreadySet"],
        "emptyNoCode": plan["emptyNoCode"],
        "samples": plan["samples"],
    }
    if dry_run:
        return report
    updated = 0
    with conn.cursor() as cur:
        for item in plan["updates"]:
            cid = item["id"]
            code = item["holderCode"]
            if not cid or not code:
                continue
            cur.execute(
                """
                UPDATE customers
                   SET holder_code = %s
                 WHERE id = %s
                   AND (holder_code IS NULL OR BTRIM(holder_code) = '')
                """,
                (code, cid),
            )
            updated += int(cur.rowcount or 0)
    conn.commit()
    report["updated"] = updated
    return report


def admin_token_configured() -> str:
    return (os.environ.get("ADMIN_TOKEN") or os.environ.get("FASIHI_ADMIN_TOKEN") or "").strip()


def admin_token_ok(provided) -> bool:
    expected = admin_token_configured()
    if not expected:
        return False
    got = str(provided or "").strip()
    return bool(got) and got == expected


def is_jalali_year(year: int) -> bool:
    """13xx/14xx years are Jalali. Mirrors `isJalaliYear` in src/lib/format.ts."""
    return 1200 <= year <= 1500


def is_gregorian_year(year: int) -> bool:
    return 1600 <= year <= 2200


def parse_ymd(raw) -> tuple[int, int, int] | None:
    text = to_en_digits(raw).strip()
    if not text:
        return None
    match = YMD_RE.match(text)
    if not match:
        return None
    y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if m < 1 or m > 12 or d < 1 or d > 31:
        return None
    return y, m, d


def jalali_to_gregorian(jy: int, jm: int, jd: int) -> tuple[int, int, int]:
    """Same 33-year cycle as `jalaliToGregorian` in src/lib/format.ts."""
    jy0 = jy + 1595
    days = (
        -355668
        + 365 * jy0
        + (jy0 // 33) * 8
        + (((jy0 % 33) + 3) // 4)
        + jd
        + ((jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186)
    )
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    months = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 1
    while gm <= 12 and gd > months[gm]:
        gd -= months[gm]
        gm += 1
    return gy, gm, gd


def parse_date_value(raw) -> date | None:
    """Gregorian ISO *or* live Jalali `YYYY/MM/DD` — never both through one calendar."""
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    text = to_en_digits(raw).strip()
    if not text:
        return None
    ymd = parse_ymd(text)
    if not ymd:
        return None
    y, m, d = ymd
    if is_jalali_year(y):
        gy, gm, gd = jalali_to_gregorian(y, m, d)
    elif is_gregorian_year(y):
        gy, gm, gd = y, m, d
    else:
        return None
    try:
        return date(gy, gm, gd)
    except ValueError:
        return None


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def relative_days(raw, from_day: date) -> int | None:
    """Whole days between a stored date and `from_day`. None when unparsable."""
    parsed = parse_date_value(raw)
    if parsed is None:
        return None
    return (parsed - from_day).days


def is_in_renewal_window(end_date, from_day: date, max_days: int = 45) -> bool:
    """Active-policy 0..max_days window — same rule as `isInRenewalWindow` on the client."""
    days = relative_days(end_date, from_day)
    return days is not None and 0 <= days <= max_days


# unpaid installment statuses for renewal fallback (not fully paid)
_RENEWAL_UNPAID_STATUSES = frozenset({"due", "overdue", "partial"})


def _installment_due_raw(inst: dict) -> str:
    return stringify_cell(inst.get("dueDate") or inst.get("due_date")).strip()


def fallback_due_from_installments(installments: list[dict], today: date) -> str:
    """Pick a due_date signal when policies.end_date is empty (Import P1).

    Among unpaid (not fully paid): soonest due_date still >= today; else latest past due.
    If every installment is paid, use max due_date among all. Empty string if none usable.
    """
    unpaid_upcoming: list[tuple[date, str]] = []
    unpaid_past: list[tuple[date, str]] = []
    all_dated: list[tuple[date, str]] = []
    for inst in installments:
        raw = _installment_due_raw(inst)
        parsed = parse_date_value(raw)
        if parsed is None:
            continue
        all_dated.append((parsed, raw))
        status = derive_installment_status(
            inst.get("amount"),
            inst.get("paidAmount") if "paidAmount" in inst else inst.get("paid_amount"),
            raw,
            today,
            inst.get("statusLabel") or inst.get("status") or "",
        )
        if status == "paid":
            continue
        if parsed >= today:
            unpaid_upcoming.append((parsed, raw))
        else:
            unpaid_past.append((parsed, raw))
    if unpaid_upcoming:
        unpaid_upcoming.sort(key=lambda t: t[0])
        return unpaid_upcoming[0][1]
    if unpaid_past:
        unpaid_past.sort(key=lambda t: t[0])
        return unpaid_past[-1][1]
    if all_dated:
        all_dated.sort(key=lambda t: t[0])
        return all_dated[-1][1]
    return ""


def effective_renewal_end(
    end_date,
    installments: list[dict] | None,
    today: date,
) -> tuple[str, str]:
    """Return (effective_end, renewalDateSource).

    Prefer nonempty policies.end_date; else installment due_date fallback.
    Source is "end_date" | "due_date" | "" when neither is usable.
    """
    raw_end = stringify_cell(end_date).strip()
    if raw_end:
        return raw_end, "end_date"
    fallback = fallback_due_from_installments(installments or [], today)
    if fallback:
        return fallback, "due_date"
    return "", ""


def policy_number_index(pol_rows: list[dict]) -> dict[str, str]:
    """policy_number → policy id (first wins). Used when installments lack policy_id/computer_code."""
    number_to_pid: dict[str, str] = {}
    for r in pol_rows:
        num = stringify_cell(row_get(r, "policy_number")).strip()
        pid = str(r.get("id") or "").strip()
        if num and pid and num not in number_to_pid:
            number_to_pid[num] = pid
    return number_to_pid


def installments_by_policy_id(
    inst_rows: list[dict],
    pol_rows: list[dict],
    customer_ids: set,
    national_to_cid: dict,
    holder_to_cid: dict | None = None,
) -> dict[str, list[dict]]:
    """Group mapped installments by policy id via policy_id / computer_code / policy_number."""
    computer_to_pid = policy_computer_index(pol_rows)
    number_to_pid = policy_number_index(pol_rows)
    mapped = map_installment_rows(
        inst_rows, customer_ids, national_to_cid, computer_to_pid, holder_to_cid
    )
    by_pid: dict[str, list[dict]] = {}
    for inst, raw in zip(mapped, inst_rows):
        pid = str(inst.get("policyId") or "").strip()
        if not pid:
            pnum = stringify_cell(row_get(raw, "policy_number")).strip()
            pid = number_to_pid.get(pnum, "")
            if pid:
                inst = {**inst, "policyId": pid}
        if not pid:
            continue
        by_pid.setdefault(pid, []).append(inst)
    return by_pid


def normalize_mobile(value) -> str:
    raw = stringify_cell(value).translate(PERSIAN_DIGITS)
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    if digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits if PHONE_RE.match(digits) else ""


def iranpayamak_config() -> dict:
    api_base = (os.environ.get("IRANPAYAMAK_API_BASE") or IRANPAYAMAK_DEFAULT_BASE).rstrip("/")
    api_key = (os.environ.get("IRANPAYAMAK_API_KEY") or "").strip()
    username = (os.environ.get("IRANPAYAMAK_USERNAME") or "").strip()
    password = (os.environ.get("IRANPAYAMAK_PASSWORD") or "").strip()
    line_number = (
        os.environ.get("IRANPAYAMAK_LINE")
        or os.environ.get("IRANPAYAMAK_LINE_NUMBER")
        or os.environ.get("IRANPAYAMAK_FROM")
        or os.environ.get("LINE_NUMBER")
        or ""
    ).strip()
    configured = bool(line_number and (api_key or (username and password)))
    return {
        "ok": True,
        "provider": "iranpayamak",
        "configured": configured,
        "apiBase": api_base,
        "usernameSet": bool(username),
        "passwordSet": bool(password),
        "fromNumberSet": bool(line_number),
        "error": None if configured else SMS_ENV_ERROR,
        "_api_key": api_key,
        "_username": username,
        "_password": password,
        "_line_number": line_number,
    }


def sms_status_public() -> dict:
    cfg = iranpayamak_config()
    return {k: v for k, v in cfg.items() if not k.startswith("_")}


def mask_phone(phone: str) -> str:
    if len(phone) < 7:
        return "***"
    return f"{phone[:4]}***{phone[-2:]}"


def append_sms_log(entry: dict) -> dict:
    public = {
        "at": entry.get("at") or iso_now(),
        "ok": bool(entry.get("ok")),
        "error": entry.get("error"),
        "code": entry.get("code"),
        "recipientCount": int(entry.get("recipientCount") or 0),
        "recipients": entry.get("recipients") or [],
        "textLength": int(entry.get("textLength") or 0),
    }
    SMS_SEND_LOG.appendleft(public)
    return public


def sms_log_public() -> list[dict]:
    return list(SMS_SEND_LOG)


def _http_json(url: str, payload: dict, headers: dict, timeout: int = 15) -> dict:
    raw = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw,
        headers={"Accept": "application/json", "Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return {"ok": True, "status": getattr(resp, "status", 200), "result": parsed}
    except urllib.error.HTTPError as exc:
        err_body = ""
        try:
            err_body = exc.read().decode("utf-8")
        except Exception:
            err_body = ""
        parsed = {}
        if err_body:
            try:
                parsed = json.loads(err_body)
            except Exception:
                parsed = {"message": err_body[:200]}
        return {"ok": False, "status": exc.code, "result": parsed, "error": "ارسال پیامک ناموفق بود"}
    except Exception:
        return {"ok": False, "error": "ارسال پیامک ناموفق بود", "code": "sms_network_error"}


def premium_ai_timeout_sec() -> float:
    """Per-attempt Gemini HTTP timeout; env PREMIUM_AI_TIMEOUT_SEC, clamp 3–20, default 8."""
    raw = (os.environ.get("PREMIUM_AI_TIMEOUT_SEC") or "8").strip()
    try:
        val = float(raw)
    except ValueError:
        val = 8.0
    return max(3.0, min(20.0, val))


def _is_timeout_exc(exc: BaseException) -> bool:
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return True
    if isinstance(exc, urllib.error.URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return True
        blob = f"{reason} {exc}".lower()
        return "timed out" in blob or "timeout" in blob
    blob = str(exc).lower()
    return "timed out" in blob or "timeout" in blob


def _http_json_premium(url: str, payload: dict, headers: dict, timeout: float = 8) -> dict:
    """POST JSON for premium-AI only — Persian errors, status on timeout (not SMS copy)."""
    raw = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw,
        headers={"Accept": "application/json", "Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return {"ok": True, "status": getattr(resp, "status", 200), "result": parsed}
    except urllib.error.HTTPError as exc:
        err_body = ""
        try:
            err_body = exc.read().decode("utf-8")
        except Exception:
            err_body = ""
        parsed = {}
        if err_body:
            try:
                parsed = json.loads(err_body)
            except Exception:
                parsed = {"message": err_body[:200]}
        return {
            "ok": False,
            "status": exc.code,
            "result": parsed,
            "error": _gemini_friendly_error(exc.code, parsed),
            "code": "premium_ai_http_error",
        }
    except Exception as exc:
        if _is_timeout_exc(exc):
            return {
                "ok": False,
                "status": 408,
                "error": PREMIUM_AI_TIMEOUT_ERROR,
                "code": "premium_ai_timeout",
                "result": {},
            }
        return {
            "ok": False,
            "status": 0,
            "error": PREMIUM_AI_NETWORK_ERROR,
            "code": "premium_ai_network_error",
            "result": {},
        }


def extract_login_token(parsed: object) -> str:
    if not isinstance(parsed, dict):
        return ""
    data = parsed.get("data") if isinstance(parsed.get("data"), dict) else parsed
    if not isinstance(data, dict):
        data = parsed
    for key in ("token", "api_key", "apiKey", "access_token", "accessToken", "key"):
        value = data.get(key) or parsed.get(key)
        if value:
            return str(value).strip()
    return ""


def iranpayamak_send_key(cfg: dict) -> tuple[str, dict | None]:
    if cfg["_api_key"]:
        return cfg["_api_key"], None
    login = _http_json(
        f"{cfg['apiBase']}/ws/v1/auth/login",
        {"username": cfg["_username"], "password": cfg["_password"], "method": None},
        {},
    )
    if not login.get("ok"):
        return "", {"ok": False, "error": SMS_ENV_ERROR, "code": "sms_login_failed"}
    token = extract_login_token(login.get("result"))
    if not token:
        return "", {"ok": False, "error": SMS_ENV_ERROR, "code": "sms_login_failed"}
    return token, None


def send_iranpayamak(text: str, recipients: list[str]) -> dict:
    cfg = iranpayamak_config()
    if not cfg["configured"]:
        return {"ok": False, "error": SMS_ENV_ERROR, "code": "sms_env_missing"}
    api_key, login_err = iranpayamak_send_key(cfg)
    if login_err:
        return login_err
    sent = _http_json(
        f"{cfg['apiBase']}/ws/v1/sms/simple",
        {
            "text": text,
            "line_number": cfg["_line_number"],
            "recipients": recipients,
            "number_format": "english",
            "schedule": None,
        },
        {"Api-Key": api_key},
    )
    if not sent.get("ok"):
        return {
            "ok": False,
            "error": sent.get("error") or "ارسال پیامک ناموفق بود",
            "code": sent.get("code") or "sms_http_error",
            "result": sent.get("result"),
        }
    parsed = sent.get("result") if isinstance(sent.get("result"), dict) else {}
    status = str(parsed.get("status") or "").lower()
    if status == "error":
        return {
            "ok": False,
            "error": str(parsed.get("message") or "ارسال پیامک ناموفق بود"),
            "code": "sms_provider_error",
            "result": parsed,
        }
    return {"ok": True, "provider": "iranpayamak", "result": parsed}


def map_customer_status(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return "active"
    if "بازخريد" in s or "بازخرید" in s:
        return "inactive"
    if "پايان" in s or "پایان" in s:
        return "lead"
    if "ابطال" in s or "فوت" in s:
        return "inactive"
    if "عادي" in s or "عادی" in s:
        return "active"
    if "انتظار" in s:
        return "lead"
    return "active"


def map_segment(raw: str | None) -> str:
    s = (raw or "").strip()
    if "حقوقی" in s or "حقوقي" in s:
        return "حقوقی"
    return "حقیقی"


def map_policy_status(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return "active"
    if "ابطال" in s or "لغو" in s or "cancel" in s.lower():
        return "cancelled"
    if "پايان" in s or "پایان" in s or "منقضی" in s or "expired" in s.lower():
        return "expired"
    if "انتظار" in s or "محاسبه نشده" in s or "pending" in s.lower():
        return "pending"
    return "active"


def map_policy_kind(raw: str | None) -> str:
    """Keep the imported kind as-is. Never force عمر و سرمایه‌گذاری."""
    return (raw or "").strip()


def snake_to_camel(name: str) -> str:
    parts = [p for p in str(name).split("_") if p]
    if not parts:
        return str(name)
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def stringify_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.replace(microsecond=0).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def extras_from_row(row: dict, consumed: set[str]) -> dict:
    extras = {}
    for key, value in row.items():
        if key in consumed:
            continue
        text = stringify_cell(value).strip()
        if not text:
            continue
        extras[snake_to_camel(key)] = text
    return extras


def fetch_all_rows(cur, table: str) -> list[dict]:
    """SELECT * so Excel-imported columns are never dropped from the wire."""
    try:
        cur.execute(f"SELECT * FROM {quote_ident(table)} ORDER BY {quote_ident('id')}")
        return cur.fetchall()
    except Exception:
        try:
            cur.connection.rollback()
        except Exception:
            pass
        cur.execute(f"SELECT * FROM {quote_ident(table)}")
        return cur.fetchall()


def row_get(row: dict, *names):
    for name in names:
        if name in row and row.get(name) is not None:
            return row.get(name)
    return None


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def fetch_counts(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM customers")
        customers = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) AS c FROM policies")
        policies = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) AS c FROM installments")
        installments = cur.fetchone()["c"]
    return {
        "customers": customers,
        "policies": policies,
        "installments": installments,
    }


CUSTOMER_CONSUMED = {
    "id",
    "full_name",
    "national_id",
    "legal_entity_id",
    "phone",
    "mobile",
    "email",
    "city",
    "status",
    "segment",
    "agent",
    "note",
    "created_at",
    "address",
    "father_name",
    "birth_date",
    "postal_code",
    "holder_code",
}
POLICY_CONSUMED = {
    "id",
    "computer_code",
    "policy_number",
    "holder_national_id",
    "holder_name",
    "holder_code",
    "status",
    "kind",
    "company",
    "premium",
    "initial_premium",
    "initial_premium_start",
    "premium_adj_pct",
    "start_date",
    "end_date",
    "issue_date",
    "installment_count",
}
INSTALLMENT_CONSUMED = {
    "id",
    "computer_code",
    "amount",
    "unpaid_amount",
    "due_date",
    "seq",
    "payer_national_id",
    "insured_national_id",
    "holder_code",
    "paid_amount",
    "paid_date",
    "payment_method",
    "status",
    "policy_id",
    "kind",
}


def qs_int(qs: dict, name: str, default: int) -> int:
    raw = (qs.get(name) or [None])[0]
    return to_int(raw, default)


def as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def customer_id_aliases(item: dict) -> set[str]:
    cid = str(item.get("id") or "").strip()
    nid = str(item.get("nationalId") or "").strip()
    holder = str(item.get("holderCode") or item.get("holder_code") or "").strip()
    aliases = {cid, nid, holder}
    if nid:
        aliases.add(f"C-{nid}")
    aliases.discard("")
    return aliases


def customer_record_matches(item: dict, key: str) -> bool:
    needle = unquote(str(key or "")).strip()
    if not needle:
        return False
    return needle in customer_id_aliases(item)


def unique_holder_codes(*groups: list[dict]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for group in groups:
        for row in group:
            code = str(row.get("holderCode") or "").strip()
            if code and code not in seen:
                seen.add(code)
                out.append(code)
    return out


def sms_dry_run_result(recipients: list[str]) -> dict:
    return {
        "ok": True,
        "dryRun": True,
        "provider": "iranpayamak",
        "code": "sms_dry_run",
        "recipientCount": len(recipients),
    }


def map_customer_rows(cust_rows: list[dict]) -> list[dict]:
    customers = []
    for r in cust_rows:
        national_id = as_identifier(row_get(r, "national_id"))
        cid = r.get("id") or (f"C-{national_id}" if national_id else "")
        status_label = stringify_cell(row_get(r, "status")).strip()
        phone = stringify_cell(row_get(r, "phone") or row_get(r, "mobile"))
        created = stringify_cell(row_get(r, "created_at")) or iso_now()
        item = {
            "id": cid,
            "fullName": stringify_cell(row_get(r, "full_name")),
            "nationalId": national_id,
            "legalEntityId": as_identifier(row_get(r, "legal_entity_id")),
            "phone": phone,
            "email": stringify_cell(row_get(r, "email")),
            "city": stringify_cell(row_get(r, "city")),
            "status": map_customer_status(status_label),
            "statusLabel": status_label,
            "segment": map_segment(stringify_cell(row_get(r, "segment"))),
            "agent": stringify_cell(row_get(r, "agent")),
            "createdAt": created,
            "note": stringify_cell(row_get(r, "note")),
            "address": stringify_cell(row_get(r, "address")),
            "fatherName": stringify_cell(row_get(r, "father_name")),
            "birthDate": stringify_cell(row_get(r, "birth_date")),
            "postalCode": as_identifier(row_get(r, "postal_code")),
            "holderCode": as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode")),
            "mobile": normalize_mobile(phone) or phone,
        }
        extras = extras_from_row(r, CUSTOMER_CONSUMED)
        if extras:
            item["extras"] = extras
        customers.append(item)
    return customers


def map_policy_rows(
    pol_rows: list[dict],
    customer_ids: set,
    national_to_cid: dict,
    holder_to_cid: dict | None = None,
) -> list[dict]:
    policies = []
    for r in pol_rows:
        hn = as_identifier(row_get(r, "holder_national_id")).strip()
        customer_id = resolve_policy_customer_id(
            r, customer_ids, national_to_cid, holder_to_cid
        )
        kind_raw = stringify_cell(row_get(r, "kind")).strip()
        status_label = stringify_cell(row_get(r, "status")).strip()
        computer_code = as_identifier(row_get(r, "computer_code"))
        number = stringify_cell(row_get(r, "policy_number")).strip() or computer_code
        item = {
            "id": r.get("id"),
            "number": number,
            "computerCode": computer_code,
            "customerId": customer_id,
            "kind": map_policy_kind(kind_raw),
            "kindRaw": kind_raw,
            "company": stringify_cell(row_get(r, "company")),
            "premium": to_float(row_get(r, "premium")),
            "startDate": stringify_cell(row_get(r, "start_date")),
            "endDate": stringify_cell(row_get(r, "end_date")),
            "issueDate": stringify_cell(row_get(r, "issue_date")),
            "status": map_policy_status(status_label),
            "statusLabel": status_label,
            "holderNationalId": hn,
            "holderName": stringify_cell(row_get(r, "holder_name")),
            "holderCode": as_identifier(row_get(r, "holder_code")),
            "installmentCount": to_int(row_get(r, "installment_count"), 1) or 1,
        }
        ip_raw = row_get(r, "initial_premium")
        if ip_raw is not None and str(ip_raw).strip() != "":
            item["initialPremium"] = to_float(ip_raw)
        ip_start_raw = row_get(r, "initial_premium_start")
        if ip_start_raw is not None and str(ip_start_raw).strip() != "":
            item["initialPremiumStart"] = to_float(ip_start_raw)
        adj_raw = row_get(r, "premium_adj_pct")
        if adj_raw is not None and str(adj_raw).strip() != "":
            item["premiumAdjPct"] = to_float(adj_raw)
        extras = extras_from_row(r, POLICY_CONSUMED)
        if extras:
            item["extras"] = extras
        policies.append(item)
    return policies


def map_installment_rows(
    inst_rows: list[dict],
    customer_ids: set,
    national_to_cid: dict,
    computer_to_pid: dict,
    holder_to_cid: dict | None = None,
) -> list[dict]:
    holder_to_cid = holder_to_cid or {}
    installments = []
    for r in inst_rows:
        cc = as_identifier(row_get(r, "computer_code")).strip()
        policy_id = stringify_cell(row_get(r, "policy_id")).strip() or computer_to_pid.get(cc, "")
        payer = as_identifier(row_get(r, "payer_national_id")).strip()
        insured = as_identifier(row_get(r, "insured_national_id")).strip()
        holder = as_identifier(row_get(r, "holder_code")).strip()
        nid = payer or insured
        if holder and holder in holder_to_cid:
            customer_id = str(holder_to_cid[holder])
        elif holder and holder in customer_ids:
            customer_id = holder
        elif nid and f"C-{nid}" in customer_ids:
            customer_id = f"C-{nid}"
        elif nid and nid in national_to_cid:
            customer_id = national_to_cid[nid]
        else:
            customer_id = f"C-{nid}" if nid else (holder if holder else "")
        status_label = stringify_cell(row_get(r, "status")).strip()
        status_lower = status_label.lower()
        kind_raw = stringify_cell(row_get(r, "kind")).strip()
        row_id = str(r.get("id") or "")
        # Preserve history; never coerce HIST → overdue.
        if (
            status_lower == "history"
            or kind_raw.lower().startswith("hist:")
            or row_id.upper().startswith("I-HIST-")
        ):
            status = "history"
        elif status_lower in {"paid", "due", "overdue", "partial"}:
            status = status_lower
        elif status_lower == "unpaid":
            # Real arrears rows — date derivation happens in derive_installment_status / client.
            status = "overdue"
        elif status_lower in INSTALLMENT_STATUS_ENUM:
            status = status_lower
        else:
            status = "overdue"
        payment_method = stringify_cell(row_get(r, "payment_method")).strip()
        paid_amount = to_float(row_get(r, "paid_amount"))
        paid_date = stringify_cell(row_get(r, "paid_date"))
        unpaid_raw = row_get(r, "unpaid_amount")
        unpaid_amount = None
        if unpaid_raw is not None and str(unpaid_raw).strip() != "":
            unpaid_amount = to_float(unpaid_raw)
        payments = []
        if paid_amount > 0 or payment_method or paid_date:
            payments.append(
                {
                    "id": f"{r.get('id')}-pay",
                    "amount": paid_amount,
                    "date": paid_date,
                    "method": payment_method,
                    "by": "",
                }
            )
        item = {
            "id": r.get("id"),
            "policyId": policy_id,
            "customerId": customer_id,
            "seq": to_int(row_get(r, "seq"), 1) or 1,
            "amount": to_float(row_get(r, "amount")),
            "paidAmount": paid_amount,
            "unpaidAmount": unpaid_amount,
            "dueDate": stringify_cell(row_get(r, "due_date")),
            "status": status,
            "statusLabel": status_label,
            "kind": kind_raw,
            "computerCode": cc,
            "holderCode": holder,
            "payerNationalId": payer,
            "insuredNationalId": insured,
            "paymentMethod": payment_method,
            "paidDate": paid_date,
            "payments": payments,
        }
        extras = extras_from_row(r, INSTALLMENT_CONSUMED)
        if extras:
            item["extras"] = extras
        installments.append(item)
    return installments


def customer_lookup(cust_rows: list[dict]) -> tuple[set, dict, dict]:
    """Build id set + national_id→id + holder_code→id maps for policy customerId resolve.

    holder_code map uses customers.holder_code and the «کد N» suffix in full_name.
    Never treat holder_code itself as a customerId.
    """
    customer_ids = {r["id"] for r in cust_rows if r.get("id")}
    national_to_cid: dict[str, str] = {}
    holder_to_cid: dict[str, str] = {}
    for r in cust_rows:
        cid = str(r.get("id") or "").strip()
        if not cid:
            nid_for_id = as_identifier(row_get(r, "national_id")).strip()
            cid = f"C-{nid_for_id}" if nid_for_id else ""
        if not cid:
            continue
        customer_ids.add(cid)
        nid = as_identifier(row_get(r, "national_id")).strip()
        if nid and nid not in national_to_cid:
            national_to_cid[nid] = cid
        holder = as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode")).strip()
        if holder and holder not in holder_to_cid:
            holder_to_cid[holder] = cid
        code = extract_holder_code_from_full_name(
            row_get(r, "full_name") or row_get(r, "fullName")
        )
        if code and code not in holder_to_cid:
            holder_to_cid[code] = cid
    return customer_ids, national_to_cid, holder_to_cid


def resolve_policy_customer_id(
    r: dict,
    customer_ids: set,
    national_to_cid: dict,
    holder_to_cid: dict | None = None,
) -> str:
    """Real CRM customers.id only — never raw holder_code as route param.

    Prefer national_id → customers.id; else holder_code → customers.id.
    If national id exists as C-{nid} in the customer set, use that.
    Unmatched rows keep customerId empty (UI shows plain text, not a broken link).
    """
    holder_to_cid = holder_to_cid or {}
    hn = as_identifier(row_get(r, "holder_national_id")).strip()
    if hn and hn in national_to_cid:
        return str(national_to_cid[hn])
    if hn and f"C-{hn}" in customer_ids:
        return f"C-{hn}"
    holder = as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode")).strip()
    if holder and holder in holder_to_cid:
        return str(holder_to_cid[holder])
    return ""


def map_customer_lite_row(r: dict) -> dict:
    """Slim list row — no extras. Used by GET /api/customers and /api/data/summary."""
    national_id = as_identifier(row_get(r, "national_id"))
    cid = r.get("id") or (f"C-{national_id}" if national_id else "")
    phone = stringify_cell(row_get(r, "phone") or row_get(r, "mobile"))
    mobile = normalize_mobile(phone) or phone
    holder = as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode"))
    return {
        "id": cid,
        "fullName": stringify_cell(row_get(r, "full_name")),
        "nationalId": national_id,
        "legalEntityId": as_identifier(row_get(r, "legal_entity_id")),
        "mobile": mobile,
        "phone": phone,
        "holderCode": holder,
        "holder_code": holder,
    }


def map_policy_lite_row(
    r: dict,
    customer_ids: set | None = None,
    national_to_cid: dict | None = None,
    holder_to_cid: dict | None = None,
) -> dict:
    hn = as_identifier(row_get(r, "holder_national_id")).strip()
    computer_code = as_identifier(row_get(r, "computer_code"))
    number = stringify_cell(row_get(r, "policy_number")).strip() or computer_code
    kind_raw = stringify_cell(row_get(r, "kind")).strip()
    status_label = stringify_cell(row_get(r, "status")).strip()
    holder = as_identifier(row_get(r, "holder_code") or row_get(r, "holderCode")).strip()
    if customer_ids is None and national_to_cid is None and holder_to_cid is None:
        # Backward-compatible: only emit C-{nid} when callers skip the join maps.
        customer_id = f"C-{hn}" if hn else ""
    else:
        customer_id = resolve_policy_customer_id(
            r,
            customer_ids or set(),
            national_to_cid or {},
            holder_to_cid or {},
        )
    item = {
        "id": r.get("id"),
        "number": number,
        "computerCode": computer_code,
        "customerId": customer_id,
        "kind": map_policy_kind(kind_raw),
        "company": stringify_cell(row_get(r, "company")),
        "premium": to_float(row_get(r, "premium")),
        "startDate": stringify_cell(row_get(r, "start_date")),
        "status": map_policy_status(status_label),
        "statusLabel": status_label,
        "holderName": stringify_cell(row_get(r, "holder_name")),
        "holderCode": holder,
        "holder_code": holder,
        "holderNationalId": hn,
        "endDate": stringify_cell(row_get(r, "end_date")),
    }
    ip_raw = row_get(r, "initial_premium")
    if ip_raw is not None and str(ip_raw).strip() != "":
        item["initialPremium"] = to_float(ip_raw)
    ip_start_raw = row_get(r, "initial_premium_start")
    if ip_start_raw is not None and str(ip_start_raw).strip() != "":
        item["initialPremiumStart"] = to_float(ip_start_raw)
    adj_raw = row_get(r, "premium_adj_pct")
    if adj_raw is not None and str(adj_raw).strip() != "":
        item["premiumAdjPct"] = to_float(adj_raw)
    return item


INSTALLMENT_STATUS_ENUM = {"paid", "due", "overdue", "partial", "history"}
DEFAULT_DUE_STATUSES = ("overdue", "due")
OPEN_INSTALLMENT_STATUSES = frozenset({"due", "overdue", "partial"})


def derive_installment_status(amount, paid_amount, due_date, today: date, wired="") -> str:
    """Amounts first; HIST stays history; then سررسید. Mirrors src/lib/map-api-data.ts."""
    amt = to_float(amount)
    paid = to_float(paid_amount)
    if amt > 0 and paid >= amt:
        return "paid"
    wired_text = stringify_cell(wired).strip().lower()
    # BNVer / policy-history ledger — not open installment debt.
    if wired_text == "history":
        return "history"
    if paid > 0:
        return "partial"
    days = relative_days(due_date, today)
    if days is not None:
        return "overdue" if days < 0 else "due"
    return wired_text if wired_text in INSTALLMENT_STATUS_ENUM else "overdue"


def overdue_days(due_date, status: str, today: date, amount=0, paid_amount=0) -> int | None:
    """Days past due only for unpaid overdue. Never for history/paid/future."""
    if status != "overdue":
        return None
    if to_float(amount) > 0 and to_float(paid_amount) >= to_float(amount):
        return None
    days = relative_days(due_date, today)
    if days is None or days >= 0:
        return None
    return abs(days)


def parse_status_filter(raw, default: tuple[str, ...] = DEFAULT_DUE_STATUSES) -> set[str]:
    text = stringify_cell(raw).strip().lower()
    if not text:
        return set(default)
    if text in {"all", "any", "*"}:
        return set(INSTALLMENT_STATUS_ENUM)
    wanted = {part.strip() for part in text.replace("|", ",").split(",") if part.strip()}
    if "unpaid" in wanted:
        wanted.discard("unpaid")
        wanted |= {"due", "overdue", "partial"}
    selected = {s for s in wanted if s in INSTALLMENT_STATUS_ENUM}
    return selected or set(default)


def date_sort_key(value) -> tuple[int, date]:
    """Undated rows sort last instead of crashing the comparison."""
    parsed = parse_date_value(value)
    return (1, date.max) if parsed is None else (0, parsed)


def customer_index(cust_rows: list[dict]) -> dict[str, dict]:
    """alias (id / national id / C-nationalId) → {name, holderCode}. Names only, no dump."""
    index: dict[str, dict] = {}
    for r in cust_rows:
        nid = as_identifier(row_get(r, "national_id")).strip()
        entry = {
            "name": stringify_cell(row_get(r, "full_name")).strip(),
            "holderCode": as_identifier(row_get(r, "holder_code")).strip(),
        }
        if not entry["name"] and not entry["holderCode"]:
            continue
        for alias in (str(r.get("id") or "").strip(), nid, f"C-{nid}" if nid else ""):
            if alias and alias not in index:
                index[alias] = entry
    return index


def customer_entry(index: dict[str, dict], *keys) -> dict:
    for key in keys:
        entry = index.get(str(key or "").strip())
        if entry:
            return entry
    return {}


def policy_computer_index(pol_rows: list[dict]) -> dict[str, str]:
    computer_to_pid: dict[str, str] = {}
    for r in pol_rows:
        cc = as_identifier(row_get(r, "computer_code")).strip()
        if cc and cc not in computer_to_pid:
            computer_to_pid[cc] = r.get("id")
    return computer_to_pid


def policy_lite_index(
    pol_rows: list[dict],
    customer_ids: set | None = None,
    national_to_cid: dict | None = None,
    holder_to_cid: dict | None = None,
) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for r in pol_rows:
        item = map_policy_lite_row(r, customer_ids, national_to_cid, holder_to_cid)
        pid = str(item.get("id") or "").strip()
        if pid:
            index[pid] = item
    return index


def map_installment_due_row(item: dict, customers: dict, policies: dict, today: date) -> dict:
    """Slim اقساط row for GET /api/installments — built from the mapped /api/data rows."""
    policy = policies.get(str(item.get("policyId") or "").strip(), {})
    customer_id = str(item.get("customerId") or "").strip()
    holder_entry = customer_entry(
        customers,
        customer_id,
        item.get("payerNationalId"),
        item.get("insuredNationalId"),
        item.get("holderCode"),
    )
    holder = (
        str(item.get("holderCode") or "").strip()
        or str(policy.get("holderCode") or "").strip()
        or str(holder_entry.get("holderCode") or "").strip()
    )
    number = str(policy.get("number") or "").strip() or str(item.get("computerCode") or "").strip()
    wired = item.get("statusLabel") or item.get("status")
    kind = str(item.get("kind") or "").strip()
    row_id = str(item.get("id") or "")
    if (
        str(wired or "").strip().lower() == "history"
        or kind.lower().startswith("hist:")
        or row_id.upper().startswith("I-HIST-")
        or str(item.get("status") or "").strip().lower() == "history"
    ):
        status = "history"
    else:
        status = derive_installment_status(
            item.get("amount"),
            item.get("paidAmount"),
            item.get("dueDate"),
            today,
            wired,
        )
    days_left = relative_days(item.get("dueDate"), today)
    unpaid = item.get("unpaidAmount")
    return {
        "id": item.get("id"),
        "policyId": item.get("policyId"),
        "policyNumber": number,
        "number": number,
        "computerCode": item.get("computerCode"),
        "customerId": customer_id,
        "customerName": str(holder_entry.get("name") or policy.get("holderName") or "").strip(),
        "seq": item.get("seq"),
        "amount": item.get("amount"),
        "paidAmount": item.get("paidAmount"),
        "unpaidAmount": unpaid,
        "dueDate": item.get("dueDate"),
        "daysLeft": days_left,
        "daysOverdue": overdue_days(
            item.get("dueDate"),
            status,
            today,
            item.get("amount") if unpaid is None else unpaid,
            item.get("paidAmount") if unpaid is None else 0,
        ),
        "status": status,
        "statusLabel": item.get("statusLabel"),
        "kind": kind,
        "holderCode": holder,
        "holder_code": holder,
        "payerNationalId": item.get("payerNationalId"),
        "insuredNationalId": item.get("insuredNationalId"),
    }


def map_renewal_row(item: dict, customers: dict, today: date) -> dict:
    """Slim تمدید row for GET /api/renewals — same fields as /api/policies/lite plus the window."""
    customer_id = str(item.get("customerId") or "").strip()
    entry = customer_entry(customers, customer_id, item.get("holderNationalId"))
    holder = str(item.get("holderCode") or "").strip() or str(entry.get("holderCode") or "").strip()
    number = str(item.get("number") or "").strip()
    end_date = stringify_cell(item.get("endDate")).strip()
    source = stringify_cell(item.get("renewalDateSource")).strip()
    row = {
        "id": item.get("id"),
        "number": number,
        "policyNumber": number,
        "computerCode": item.get("computerCode"),
        "customerId": customer_id,
        "customerName": str(entry.get("name") or item.get("holderName") or "").strip(),
        "kind": item.get("kind"),
        "company": item.get("company"),
        "premium": item.get("premium"),
        "endDate": end_date,
        "daysLeft": relative_days(end_date, today),
        "status": item.get("status"),
        "statusLabel": item.get("statusLabel"),
        "holderName": item.get("holderName"),
        "holderCode": holder,
        "holder_code": holder,
        "holderNationalId": item.get("holderNationalId"),
        "renewalDateSource": source or "end_date",
    }
    policy_end = stringify_cell(item.get("policyEndDate")).strip()
    if policy_end or source == "due_date":
        row["policyEndDate"] = policy_end
    return row


def matches_lite_query(item: dict, q: str) -> bool:
    needle = (q or "").strip().casefold()
    if not needle:
        return True
    parts = [
        item.get("id"),
        item.get("fullName"),
        item.get("customerName"),
        item.get("policyNumber"),
        item.get("nationalId"),
        item.get("legalEntityId"),
        item.get("mobile"),
        item.get("phone"),
        item.get("holderCode"),
        item.get("number"),
        item.get("computerCode"),
        item.get("customerId"),
        item.get("kind"),
        item.get("company"),
        item.get("holderName"),
    ]
    return needle in " ".join(str(p) for p in parts if p).casefold()


def fetch_customers_mapped(conn) -> list[dict]:
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
    return map_customer_rows(cust_rows)


def fetch_data(conn) -> dict:
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
        pol_rows = fetch_all_rows(cur, "policies")
        inst_rows = fetch_all_rows(cur, "installments")

    customer_ids, national_to_cid, holder_to_cid = customer_lookup(cust_rows)
    computer_to_pid = policy_computer_index(pol_rows)

    return {
        "customers": map_customer_rows(cust_rows),
        "policies": map_policy_rows(pol_rows, customer_ids, national_to_cid, holder_to_cid),
        "installments": map_installment_rows(inst_rows, customer_ids, national_to_cid, computer_to_pid, holder_to_cid),
    }


def fetch_summary(conn) -> dict:
    """Slim customers only — no extras, policies, or installments. For list first paint."""
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
    customers = [map_customer_lite_row(r) for r in cust_rows]
    counts = fetch_counts(conn)
    return {"customers": customers, "counts": counts}


def fetch_customers_page(
    conn, limit: int, offset: int, q: str = "", id_filter: str = "", segment: str = ""
) -> dict:
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
    items = [map_customer_lite_row(r) for r in cust_rows]
    if (id_filter or "").strip():
        items = [item for item in items if customer_record_matches(item, id_filter)]
    if (q or "").strip():
        items = [item for item in items if matches_lite_query(item, q)]
    if segment in {"حقیقی", "حقوقی"}:
        items = [item for item in items if item.get("segment") == segment]
    total = len(items)
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    return {
        "customers": items[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def jalali_year_month(raw) -> tuple[int, int] | None:
    """Extract Jalali year/month from live policy date text for list filtering."""
    ymd = parse_ymd(raw)
    if not ymd or not is_jalali_year(ymd[0]):
        return None
    return ymd[0], ymd[1]


def fetch_policies_lite(
    conn, limit: int, offset: int, q: str = "", year: int | None = None, month: int | None = None
) -> dict:
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
        pol_rows = fetch_all_rows(cur, "policies")
    customer_ids, national_to_cid, holder_to_cid = customer_lookup(cust_rows)
    items = [
        map_policy_lite_row(r, customer_ids, national_to_cid, holder_to_cid)
        for r in pol_rows
    ]
    if (q or "").strip():
        items = [item for item in items if matches_lite_query(item, q)]
    if year is not None or month is not None:
        def matches_end_month(item: dict) -> bool:
            ym = jalali_year_month(item.get("endDate"))
            return bool(ym and (year is None or ym[0] == year) and (month is None or ym[1] == month))

        items = [item for item in items if matches_end_month(item)]
    total = len(items)
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    return {
        "policies": items[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def fetch_installments_due(
    conn,
    statuses: set[str],
    limit: int,
    offset: int = 0,
    q: str = "",
    today: date | None = None,
) -> dict:
    """اقساط سررسید/معوق — same tables and mapping as /api/data, slim rows only."""
    day = today or today_utc()
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
        pol_rows = fetch_all_rows(cur, "policies")
        inst_rows = fetch_all_rows(cur, "installments")
    customer_ids, national_to_cid, holder_to_cid = customer_lookup(cust_rows)
    mapped = map_installment_rows(
        inst_rows,
        customer_ids,
        national_to_cid,
        policy_computer_index(pol_rows),
        holder_to_cid,
    )
    customers = customer_index(cust_rows)
    policies = policy_lite_index(pol_rows, customer_ids, national_to_cid, holder_to_cid)
    items = [map_installment_due_row(item, customers, policies, day) for item in mapped]
    items = [item for item in items if item["status"] in statuses]
    if (q or "").strip():
        items = [item for item in items if matches_lite_query(item, q)]
    items.sort(key=lambda item: date_sort_key(item.get("dueDate")))
    total = len(items)
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    return {
        "installments": items[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
        "statuses": sorted(statuses),
        "asOf": day.isoformat(),
    }


def fetch_renewals(
    conn,
    within_days: int,
    limit: int,
    offset: int = 0,
    q: str = "",
    today: date | None = None,
) -> dict:
    """بیمه‌نامه‌های فعال با پایان پوشش در ۰ تا within_days روز آینده (تاریخ جلالی یا میلادی).

    When policies.end_date is empty (e.g. overdue_installments), fall back to installment
    due_date — see effective_renewal_end / Import P1 AMIR_ACCEPT_DATA.
    """
    day = today or today_utc()
    within_days = max(0, min(365, within_days))
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
        pol_rows = fetch_all_rows(cur, "policies")
        inst_rows = fetch_all_rows(cur, "installments")
    customers = customer_index(cust_rows)
    customer_ids, national_to_cid, holder_to_cid = customer_lookup(cust_rows)
    inst_by_policy = installments_by_policy_id(
        inst_rows, pol_rows, customer_ids, national_to_cid, holder_to_cid
    )
    items = []
    for r in pol_rows:
        raw_status = stringify_cell(row_get(r, "status")).strip()
        # P1 mark «تمدید شد» — leave renewals queue without wiping Import rows
        if "تمدید شد" in raw_status or "renewed" in raw_status.lower():
            continue
        item = map_policy_lite_row(r, customer_ids, national_to_cid, holder_to_cid)
        if item.get("status") != "active":
            continue
        pid = str(item.get("id") or "").strip()
        raw_end = stringify_cell(item.get("endDate")).strip()
        effective, source = effective_renewal_end(
            raw_end, inst_by_policy.get(pid, []), day
        )
        if not is_in_renewal_window(effective, day, within_days):
            continue
        item["policyEndDate"] = raw_end
        item["endDate"] = effective
        item["renewalDateSource"] = source
        items.append(map_renewal_row(item, customers, day))
    if (q or "").strip():
        items = [item for item in items if matches_lite_query(item, q)]
    items.sort(key=lambda item: date_sort_key(item.get("endDate")))
    total = len(items)
    limit = max(1, min(200, limit))
    offset = max(0, offset)
    return {
        "policies": items[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
        "withinDays": within_days,
        "asOf": day.isoformat(),
    }


def _policy_customer_id(
    r: dict,
    customer_ids: set,
    national_to_cid: dict,
    holder_to_cid: dict | None = None,
) -> str:
    return resolve_policy_customer_id(r, customer_ids, national_to_cid, holder_to_cid)


def fetch_dossier(conn, key: str) -> dict | None:
    """One holder + related policies/installments. Does not serialize the full CRM dump."""
    with conn.cursor() as cur:
        cust_rows = fetch_all_rows(cur, "customers")
        pol_rows = fetch_all_rows(cur, "policies")
        inst_rows = fetch_all_rows(cur, "installments")
    customers = map_customer_rows(cust_rows)
    customer = next((c for c in customers if customer_record_matches(c, key)), None)
    if not customer:
        return None
    aliases = customer_id_aliases(customer)
    customer_ids, national_to_cid, holder_to_cid = customer_lookup(cust_rows)
    matched_pol = [
        r
        for r in pol_rows
        if _policy_customer_id(r, customer_ids, national_to_cid, holder_to_cid) in aliases
        or as_identifier(row_get(r, "holder_code")).strip() in aliases
    ]
    policies = map_policy_rows(matched_pol, customer_ids, national_to_cid, holder_to_cid)
    policy_ids = {p.get("id") for p in policies if p.get("id")}
    computer_to_pid = policy_computer_index(pol_rows)
    customer_holder = str(customer.get("holderCode") or "").strip()
    if customer_holder:
        aliases.add(customer_holder)
    matched_inst = []
    for r in inst_rows:
        row_holder = as_identifier(row_get(r, "holder_code")).strip()
        # Hard bind: installment with a holder_code must belong to this holder.
        if row_holder and row_holder not in aliases:
            continue
        cc = as_identifier(row_get(r, "computer_code")).strip()
        pid = stringify_cell(row_get(r, "policy_id")).strip() or computer_to_pid.get(cc, "")
        payer = as_identifier(row_get(r, "payer_national_id")).strip()
        insured = as_identifier(row_get(r, "insured_national_id")).strip()
        nid = payer or insured
        inst_cid = f"C-{nid}" if nid else ""
        holder_hit = bool(row_holder and row_holder in aliases)
        id_hit = inst_cid in aliases or (nid and nid in aliases)
        policy_hit = (not row_holder) and pid in policy_ids
        if holder_hit or id_hit or policy_hit:
            matched_inst.append(r)
    installments = map_installment_rows(
        matched_inst, customer_ids, national_to_cid, computer_to_pid, holder_to_cid
    )
    return {
        "customer": customer,
        "policies": policies,
        "installments": installments,
        "holderCodes": unique_holder_codes(policies, installments),
    }


def html_escape(s: str) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_data_html(data: dict, counts: dict) -> str:
    def rows_table(title: str, headers: list[str], items: list[dict], keys: list[str], limit: int = 50) -> str:
        head = "".join(f"<th>{html_escape(h)}</th>" for h in headers)
        body_parts = []
        for item in items[:limit]:
            tds = "".join(f"<td>{html_escape(item.get(k, ''))}</td>" for k in keys)
            body_parts.append(f"<tr>{tds}</tr>")
        note = f"<p class='note'>نمایش {min(limit, len(items))} از {len(items)} — برای جستجوی کامل از API استفاده کنید.</p>"
        return f"""
        <section>
          <h2>{html_escape(title)} ({len(items)})</h2>
          {note}
          <div class="wrap"><table><thead><tr>{head}</tr></thead><tbody>
          {''.join(body_parts) or '<tr><td colspan="99">خالی</td></tr>'}
          </tbody></table></div>
        </section>
        """

    cust_html = rows_table(
        "مشتریان",
        ["شناسه", "نام", "کدملی", "شناسه حقوقی", "تلفن", "شهر", "وضعیت", "برچسب وضعیت", "بخش"],
        data["customers"],
        ["id", "fullName", "nationalId", "legalEntityId", "phone", "city", "status", "statusLabel", "segment"],
    )
    pol_html = rows_table(
        "بیمه‌نامه‌ها",
        ["شناسه", "شماره", "کد رایانه", "مشتری", "نوع", "شرکت", "حق‌بیمه", "وضعیت"],
        data["policies"],
        ["id", "number", "computerCode", "customerId", "kind", "company", "premium", "status"],
    )
    inst_html = rows_table(
        "اقساط",
        ["شناسه", "بیمه‌نامه", "کد رایانه", "مشتری", "ردیف", "مبلغ", "سررسید", "وضعیت"],
        data["installments"],
        ["id", "policyId", "computerCode", "customerId", "seq", "amount", "dueDate", "status"],
    )

    return f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>CRM فصیحی — داده واقعی VPS</title>
  <style>
    body {{ font-family: Tahoma, "Segoe UI", sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }}
    header {{ padding: 1.25rem 1.5rem; background: #1e293b; border-bottom: 1px solid #334155; }}
    h1 {{ margin: 0 0 .35rem; font-size: 1.35rem; }}
    .sub {{ color: #94a3b8; font-size: .9rem; }}
    .kpis {{ display: flex; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.5rem; }}
    .kpi {{ background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1rem 1.25rem; min-width: 140px; }}
    .kpi b {{ display: block; font-size: 1.6rem; color: #38bdf8; }}
    .kpi span {{ color: #94a3b8; font-size: .85rem; }}
    section {{ padding: 0 1.5rem 1.5rem; }}
    h2 {{ font-size: 1.1rem; margin: 1rem 0 .5rem; }}
    .note {{ color: #94a3b8; font-size: .85rem; margin: 0 0 .5rem; }}
    .wrap {{ overflow-x: auto; border: 1px solid #334155; border-radius: 10px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: .82rem; }}
    th, td {{ padding: .45rem .6rem; border-bottom: 1px solid #334155; text-align: right; white-space: nowrap; }}
    th {{ background: #1e293b; position: sticky; top: 0; }}
    tr:hover td {{ background: #172033; }}
    a {{ color: #38bdf8; }}
  </style>
</head>
<body>
  <header>
    <h1>CRM فصیحی — داده واقعی VPS</h1>
    <div class="sub">منبع: PostgreSQL روی همین سرور · API: <a href="/api/health">/api/health</a> · <a href="/api/data">/api/data</a></div>
  </header>
  <div class="kpis">
    <div class="kpi"><b>{counts['customers']}</b><span>مشتری</span></div>
    <div class="kpi"><b>{counts['policies']}</b><span>بیمه‌نامه</span></div>
    <div class="kpi"><b>{counts['installments']}</b><span>قسط</span></div>
  </div>
  {cust_html}
  {pol_html}
  {inst_html}
</body>
</html>
"""



# --- Premium adjustment calc (P_n = P_0 * (1+r)**(n-1); P in Rial, n from 1) ---
LIFE_PREMIUM_RATES = (0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30)
RETIREMENT_PREMIUM_RATE = 0.10

# دیه ۱۴۰۵ VERIFIED — قوه قضاییه (not claim). Rial; Toman = Rial/10.
DIYA_DEFAULT_YEAR = 1405
DIYA_1405_VERIFIED = {
    "status": "VERIFIED",
    "year": DIYA_DEFAULT_YEAR,
    "sourceLabel": "قوه قضاییه",
    "ordinaryRial": 21_000_000_000,
    "haramRial": 28_000_000_000,
    "ordinaryToman": 2_100_000_000,
    "haramToman": 2_800_000_000,
    "thirdPartyPropertyMinRial": 700_000_000,
    "thirdPartyPropertyMinToman": 70_000_000,
}


def premium_at_year(p0: float, r: float, n: int) -> int:
    if p0 < 0 or r < 0 or n < 1:
        return 0
    return int(round(p0 * ((1 + r) ** (n - 1))))


def premium_adjustment_schedule(
    p0: float, r: float, years: int, start_year: int = DIYA_DEFAULT_YEAR
) -> list[dict]:
    """Year-by-year schedule. Each year is a 12-month Jalali insurance year.

    year = policy year index 1..n (compat)
    jalaliYear = start_year + n - 1
    """
    years = int(years)
    if years < 1:
        return []
    years = min(years, 100)
    start_year = int(start_year)
    rows = []
    for n in range(1, years + 1):
        rial = premium_at_year(p0, r, n)
        rows.append(
            {
                "year": n,
                "jalaliYear": start_year + n - 1,
                "premiumRial": rial,
                "premiumToman": int(round(rial / 10)),
            }
        )
    return rows


def parse_premium_adjustment_body(body: dict) -> tuple[list[dict] | None, str | None]:
    try:
        p0 = float(body.get("p0"))
        r = float(body.get("r"))
        years = int(body.get("years"))
    except (TypeError, ValueError):
        return None, "p0، r و years باید عددی باشند"
    if p0 < 0 or r < 0 or years < 1:
        return None, "مقادیر خارج از بازه مجاز"
    start_year = body.get("startYear", DIYA_DEFAULT_YEAR)
    if start_year is None or start_year == "":
        start_year = DIYA_DEFAULT_YEAR
    try:
        start_year = int(start_year)
    except (TypeError, ValueError):
        return None, "startYear باید عددی باشد"
    if start_year < 1300 or start_year > 1600:
        return None, "startYear خارج از بازه مجاز"
    return premium_adjustment_schedule(p0, r, years, start_year=start_year), None

def load_premium_ai_system_brief() -> str:
    """Locked system brief for Gemini systemInstruction."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / "PREMIUM_AI_SYSTEM_BRIEF.md",
        here.parent / "docs" / "PREMIUM_AI_SYSTEM_BRIEF.md",
    ]
    for p in candidates:
        try:
            if p.is_file():
                return p.read_text(encoding="utf-8")
        except OSError:
            continue
    return (
        "مشاور حرفه‌ای استعلام حق‌بیمه ثالث و بدنه برای نمایندگی کارآفرین ۳۰۴۵. "
        "اگر داده کم است بپرس؛ عدد جعلی نساز. دیه ۱۴۰۵ · حداقل مالی ≈ ۷۰ میلیون · "
        "تخفیف عدم خسارت ۵٪/سال تا ۷۰٪ · همه شرکت‌های برگشتی را لیست کن."
    )


def premium_ai_config() -> dict:
    provider = (os.environ.get("PREMIUM_AI_PROVIDER") or "gemini").strip().lower() or "gemini"
    api_key = (os.environ.get("PREMIUM_AI_API_KEY") or "").strip()
    # Model from env PREMIUM_AI_MODEL (default gemini-3.8-flash); not hardcoded to 2.0
    model = (os.environ.get("PREMIUM_AI_MODEL") or PREMIUM_AI_DEFAULT_MODEL).strip() or PREMIUM_AI_DEFAULT_MODEL
    api_version = (os.environ.get("PREMIUM_AI_API_VERSION") or "v1beta").strip() or "v1beta"
    base = (os.environ.get("PREMIUM_AI_BASE_URL") or PREMIUM_AI_DEFAULT_BASE).rstrip("/")
    auth_style = (os.environ.get("PREMIUM_AI_AUTH_STYLE") or "query_key").strip().lower() or "query_key"
    configured = bool(api_key) and provider == "gemini"
    return {
        "ok": True,
        "configured": configured,
        "provider": provider,
        "model": model,
        "modelLabel": model,
        "apiVersion": api_version,
        "apiBase": base,
        "authStyle": auth_style,
        "error": None if configured else PREMIUM_AI_ENV_ERROR,
        "_api_key": api_key,
    }


def _premium_ai_probe_primary(cfg: dict) -> dict:
    """Short 3s generateContent probe against primary model (no secrets returned)."""
    model = cfg.get("model") or PREMIUM_AI_DEFAULT_MODEL
    brief = "پاسخ کوتاه بده."
    contents = [{"role": "user", "parts": [{"text": "ping"}]}]
    return _premium_ai_generate(cfg, model, brief, contents, timeout=3.0)


def premium_ai_status_public() -> dict:
    cfg = premium_ai_config()
    fallback = (os.environ.get("PREMIUM_AI_MODEL_FALLBACK") or "").strip()
    public = {k: v for k, v in cfg.items() if not k.startswith("_")}
    public["fallbackConfigured"] = bool(fallback)
    if not cfg.get("configured"):
        return public
    try:
        probe = _premium_ai_probe_primary(cfg)
    except Exception:
        public["error"] = PREMIUM_AI_EGRESS_ERROR
        return public
    if probe.get("ok"):
        return public
    status = probe.get("status")
    code = probe.get("code")
    if status == 403:
        public["error"] = PREMIUM_AI_KEY_403
    elif status == 408 or code == "premium_ai_timeout":
        public["error"] = PREMIUM_AI_EGRESS_ERROR
    elif code == "premium_ai_network_error":
        public["error"] = PREMIUM_AI_EGRESS_ERROR
    else:
        public["error"] = _gemini_friendly_error(status, probe.get("result"))
    return public


def _gemini_extract_text(parsed: object) -> str:
    if not isinstance(parsed, dict):
        return ""
    cands = parsed.get("candidates")
    if not isinstance(cands, list) or not cands:
        return ""
    content = cands[0].get("content") if isinstance(cands[0], dict) else None
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    chunks = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            chunks.append(part["text"])
    return "\n".join(chunks).strip()


def _messages_to_gemini_contents(messages: list) -> list:
    contents = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = str(msg.get("role") or "user").lower()
        text = str(msg.get("content") or "").strip()
        if not text:
            continue
        if role == "system":
            # system goes to systemInstruction separately
            continue
        gem_role = "model" if role in ("assistant", "model") else "user"
        contents.append({"role": gem_role, "parts": [{"text": text}]})
    return contents


def coerce_premium_ai_messages(body: object) -> list:
    """Accept messages[] or alias string fields used by QA/older clients."""
    if not isinstance(body, dict):
        return []
    messages = body.get("messages")
    if isinstance(messages, list) and messages:
        return messages[:40]
    for key in ("message", "text", "prompt", "content", "q"):
        val = body.get(key)
        if isinstance(val, str) and val.strip():
            return [{"role": "user", "content": val.strip()[:8000]}]
        if isinstance(val, dict):
            inner = val.get("content") or val.get("text") or val.get("message")
            if isinstance(inner, str) and inner.strip():
                return [{"role": "user", "content": inner.strip()[:8000]}]
    return []


def _gemini_friendly_error(status: object, result: object) -> str:
    """Persian-friendly upstream error; never leak API key or raw body."""
    try:
        code = int(status) if status is not None else 0
    except (TypeError, ValueError):
        code = 0
    reason = ""
    if isinstance(result, dict):
        err = result.get("error")
        if isinstance(err, dict):
            reason = str(err.get("status") or "").strip()
            if not reason:
                msg = str(err.get("message") or "").strip()
                # Keep short status-like tokens only (e.g. UNAVAILABLE), drop long bodies
                if msg and len(msg) <= 80 and "AIza" not in msg and "key" not in msg.lower():
                    reason = msg.split("\n")[0].strip()
        elif isinstance(err, str) and len(err) <= 80 and "AIza" not in err:
            reason = err.strip()
    if code == 403:
        base = PREMIUM_AI_KEY_403
    elif code == 404:
        base = "مدل Gemini در دسترس این کلید نیست (۴۰۴)"
    elif code == 408:
        base = PREMIUM_AI_TIMEOUT_ERROR
    elif code == 503:
        base = "سرویس Gemini موقتاً شلوغ است (۵۰۳)"
    elif code:
        base = f"خطای بالادست Gemini ({code})"
    else:
        base = "پاسخ مشاور ناموفق بود"
    if reason and "AIza" not in reason and "key" not in reason.lower():
        return f"{base} — {reason}"
    return base


def _premium_ai_fallback_eligible(sent: dict) -> bool:
    if sent.get("ok"):
        return False
    status = sent.get("status")
    code = sent.get("code")
    if code == "premium_ai_timeout":
        return True
    return status in (403, 404, 503, 408)


def _premium_ai_generate(
    cfg: dict, model: str, brief: str, contents: list, *, timeout: float | None = None
) -> dict:
    url = f"{cfg['apiBase']}/models/{model}:generateContent"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if cfg["authStyle"] in ("header", "x-goog-api-key"):
        headers["x-goog-api-key"] = cfg["_api_key"]
    else:
        url = f"{url}?key={cfg['_api_key']}"
    payload = {
        "systemInstruction": {"parts": [{"text": brief}]},
        "contents": contents,
    }
    to = premium_ai_timeout_sec() if timeout is None else float(timeout)
    return _http_json_premium(url, payload, headers, timeout=to)


def send_premium_ai_chat(messages: list) -> dict:
    """Proxy to Gemini generateContent. API key never returned to client.

    Attempt order: primary once (single short retry ONLY on HTTP 503);
    then FALLBACK once if configured and different. Timeouts are fallback-eligible.
    Per-attempt timeout defaults to 8s so total wall stays under ~15s.
    """
    cfg = premium_ai_config()
    if not cfg["configured"]:
        return {"ok": False, "error": PREMIUM_AI_ENV_ERROR, "code": "premium_ai_env_missing"}
    if cfg["provider"] != "gemini":
        return {"ok": False, "error": "فقط Gemini پشتیبانی می‌شود", "code": "premium_ai_provider"}

    brief = load_premium_ai_system_brief()
    contents = _messages_to_gemini_contents(messages)
    if not contents:
        return {"ok": False, "error": "پیام خالی است — بدنه باید messages[] یا message/text/prompt/content/q باشد", "code": "premium_ai_empty"}

    primary = (os.environ.get("PREMIUM_AI_MODEL") or PREMIUM_AI_DEFAULT_MODEL).strip() or PREMIUM_AI_DEFAULT_MODEL
    fallback = (os.environ.get("PREMIUM_AI_MODEL_FALLBACK") or "").strip()

    def attempt(model: str, *, retry_on_503: bool) -> dict:
        sent = _premium_ai_generate(cfg, model, brief, contents)
        status = sent.get("status")
        # Retry ONLY for HTTP 503 — never for timeout/403/network
        if (not sent.get("ok")) and retry_on_503 and status == 503:
            time.sleep(0.35)
            sent = _premium_ai_generate(cfg, model, brief, contents)
        return sent

    sent = attempt(primary, retry_on_503=True)
    used_model = primary
    if (not sent.get("ok")) and fallback and fallback != primary and _premium_ai_fallback_eligible(sent):
        sent = attempt(fallback, retry_on_503=False)
        used_model = fallback

    if not sent.get("ok"):
        err = sent.get("error")
        if not err or err == "ارسال پیامک ناموفق بود":
            err = _gemini_friendly_error(sent.get("status"), sent.get("result"))
        if sent.get("status") == 403 or (not sent.get("status") and "۴۰۳" in str(err)):
            err = PREMIUM_AI_KEY_403
        return {
            "ok": False,
            "error": err,
            "code": sent.get("code") or "premium_ai_http_error",
            "status": sent.get("status"),
            "model": used_model,
            "modelLabel": used_model,
        }
    text_out = _gemini_extract_text(sent.get("result"))
    if not text_out:
        return {
            "ok": False,
            "error": "پاسخ خالی از مدل",
            "code": "premium_ai_empty_response",
            "model": used_model,
            "modelLabel": used_model,
        }
    return {
        "ok": True,
        "mode": "live",
        "provider": "gemini",
        "model": used_model,
        "modelLabel": used_model,
        "content": text_out,
    }



class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _write_body(self, body: bytes) -> None:
        if getattr(self, "_head_only", False):
            return
        try:
            view = memoryview(body)
            for start in range(0, len(body), WRITE_CHUNK):
                self.wfile.write(view[start : start + WRITE_CHUNK])
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def _send(
        self,
        code: int,
        body: bytes,
        content_type: str,
        content_encoding: str | None = None,
    ):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", content_type)
        if content_encoding:
            self.send_header("Content-Encoding", content_encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._write_body(body)

    def _json(self, code: int, obj, *, gzip_body: bool = False):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        encoding = None
        if gzip_body:
            body, encoding = maybe_gzip(body, self.headers.get("Accept-Encoding"))
        self._send(code, body, "application/json; charset=utf-8", encoding)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_HEAD(self):
        self._head_only = True
        try:
            self.do_GET()
        finally:
            self._head_only = False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                with get_conn() as conn:
                    counts = fetch_counts(conn)
                self._json(200, {"ok": True, "counts": counts})
                return

            if path in ("/api/sms-panel/settings", "/api/sms/settings"):
                self._json(200, sms_panel.panel_settings_get())
                return
            if path in ("/api/sms-panel/inbox", "/api/sms/inbox"):
                self._json(200, sms_panel.panel_inbox())
                return
            if path == "/api/urgent-tasks":
                self._json(200, {"ok": True, "items": sms_panel.list_urgent_tasks()})
                return
            if path == "/api/sms/status":
                self._json(200, sms_status_public())
                return
            if path == "/api/sms/log":
                self._json(200, {"ok": True, "items": sms_log_public()})
                return
            if path == "/api/premium-ai/status":
                self._json(200, premium_ai_status_public())
                return
            if path == "/api/premium-compare/status":
                self._json(200, bimebazar_status_public())
                return
            if path == "/api/data/summary":
                with get_conn() as conn:
                    data = fetch_summary(conn)
                self._json(200, data, gzip_body=True)
                return
            if path == "/api/data":
                with get_conn() as conn:
                    data = fetch_data(conn)
                self._json(200, data, gzip_body=True)
                return
            if path == "/api/customers":
                limit = qs_int(qs, "limit", 50)
                offset = qs_int(qs, "offset", 0)
                q = (qs.get("q") or [""])[0] or ""
                id_filter = (qs.get("id") or [""])[0] or ""
                segment = (qs.get("segment") or [""])[0] or ""
                with get_conn() as conn:
                    data = fetch_customers_page(
                        conn, limit, offset, q=q, id_filter=id_filter, segment=segment
                    )
                self._json(200, data)
                return
            if path in ("/api/policies/lite", "/api/policies"):
                limit = qs_int(qs, "limit", 50)
                offset = qs_int(qs, "offset", 0)
                q = (qs.get("q") or [""])[0] or ""
                year = qs_int(qs, "year", 0)
                month = qs_int(qs, "month", 0)
                year = year if 1200 <= year <= 1500 else None
                month = month if 1 <= month <= 12 else None
                with get_conn() as conn:
                    data = fetch_policies_lite(conn, limit, offset, q=q, year=year, month=month)
                self._json(200, data)
                return
            if path == "/api/installments":
                limit = qs_int(qs, "limit", 200)
                offset = qs_int(qs, "offset", 0)
                q = (qs.get("q") or [""])[0] or ""
                statuses = parse_status_filter((qs.get("status") or [""])[0])
                with get_conn() as conn:
                    data = fetch_installments_due(conn, statuses, limit, offset, q=q)
                self._json(200, data, gzip_body=True)
                return
            if path == "/api/renewals":
                limit = qs_int(qs, "limit", 200)
                offset = qs_int(qs, "offset", 0)
                q = (qs.get("q") or [""])[0] or ""
                within_days = qs_int(qs, "withinDays", qs_int(qs, "days", 45))
                with get_conn() as conn:
                    data = fetch_renewals(conn, within_days, limit, offset, q=q)
                self._json(200, data, gzip_body=True)
                return
            # Live documents (Import) before dossier GET — key often C-K{holder}
            if path.startswith("/api/customers/") and path.rstrip("/").endswith("/documents"):
                key = unquote(path[len("/api/customers/") : -len("/documents")]).strip().rstrip("/")
                if not key:
                    self._json(400, {"ok": False, "error": "شناسه بیمه‌گذار خالی است"})
                    return
                if documents_module is not None:
                    with get_conn() as conn:
                        documents_module.ensure_table(conn)
                        items = documents_module.list_documents(conn, key)
                    self._json(200, {
                        "ok": True,
                        "customerId": key,
                        "categories": documents_module.CATEGORIES,
                        "documents": items,
                        "items": items,
                        "count": len(items),
                    })
                    return
                with get_conn() as conn:
                    code, payload = persist.handle_request(
                        "GET", path, query=qs, conn=conn,
                        client_ip=self.client_address[0] if self.client_address else None,
                        user_agent=self.headers.get("User-Agent"),
                    )
                self._json(code, payload)
                return
            if path.startswith("/api/documents/") and path.endswith("/file") and documents_module is not None:
                doc_id = unquote(path[len("/api/documents/") : -len("/file")]).strip()
                with get_conn() as conn:
                    documents_module.ensure_table(conn)
                    meta, blob = documents_module.read_document(conn, doc_id)
                if not meta:
                    self._json(404, {"ok": False, "error": "سند یافت نشد"})
                    return
                if blob is None:
                    self._json(404, {"ok": False, "error": "فایل روی دیسک یافت نشد", "code": "file_missing"})
                    return
                self._send(200, blob, meta["mime_type"])
                return
            if path.startswith("/api/customers/"):
                key = unquote(path[len("/api/customers/") :]).strip()
                if not key:
                    self._json(400, {"ok": False, "error": "شناسه بیمه‌گذار خالی است"})
                    return
                with get_conn() as conn:
                    data = fetch_dossier(conn, key)
                if not data:
                    self._json(404, {"ok": False, "error": "بیمه‌گذار یافت نشد"})
                    return
                self._json(200, data, gzip_body=True)
                return
            if path == "/api/admin/backfill-holder-code":
                # Read-only dry-run (no token required).
                with get_conn() as conn:
                    report = apply_holder_code_backfill(conn, dry_run=True)
                public = {k: v for k, v in report.items() if k != "updates"}
                self._json(200, public)
                return
            if path in ("/api/calc/diya", "/api/diya"):
                # Locked دیه ۱۴۰۵ VERIFIED — قوه قضاییه (no DB).
                self._json(200, dict(DIYA_1405_VERIFIED))
                return
            if path.startswith("/api/sales-network"):
                code, payload = sales_network.handle_request("GET", path)
                self._json(code, payload)
                return
            if path.startswith("/api/sima-zar"):
                code, payload = sima_zar.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return
            if path.startswith("/api/omid-pension"):
                code, payload = omid_pension.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            if path.startswith("/api/group-health"):
                code, payload = group_health.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            if path.startswith("/api/sanhab"):
                code, payload = sanhab.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            # DMS durable files — delegate to documents.py (/opt/fasihi/documents)
            if path.startswith("/api/dms/files") and documents_module is not None:
                # GET /api/dms/files/{id}/file
                if path.endswith("/file") and path.count("/") >= 4:
                    doc_id = unquote(path[len("/api/dms/files/") : -len("/file")]).strip().strip("/")
                    with get_conn() as conn:
                        documents_module.ensure_table(conn)
                        meta, blob = documents_module.read_document(conn, doc_id)
                    if not meta:
                        self._json(404, {"ok": False, "error": "سند یافت نشد"})
                        return
                    if blob is None:
                        self._json(404, {"ok": False, "error": "فایل روی دیسک یافت نشد", "code": "file_missing"})
                        return
                    self._send(200, blob, meta["mime_type"])
                    return
                # GET /api/dms/files?customerId=
                if path.rstrip("/") == "/api/dms/files":
                    key = _dms_files_customer_key(qs=qs)
                    if not key:
                        self._json(400, {"ok": False, "error": "customerId یا policyholderCode الزامی است"})
                        return
                    with get_conn() as conn:
                        documents_module.ensure_table(conn)
                        items = documents_module.list_documents(conn, key)
                    self._json(200, {
                        "ok": True,
                        "customerId": key,
                        "categories": documents_module.CATEGORIES,
                        "documents": items,
                        "items": items,
                        "count": len(items),
                        "documentsRoot": getattr(documents_module, "DOCUMENTS_ROOT", "/opt/fasihi/documents"),
                        "maxBytes": getattr(documents_module, "MAX_FILE_BYTES", 8 * 1024 * 1024),
                        "durable": True,
                        "demoStub": False,
                    })
                    return
                self._json(404, {"ok": False, "error": "not found"})
                return

            if path.startswith("/api/dms"):
                code, payload = dms.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            if path.startswith("/api/loyalty"):
                code, payload = loyalty.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            if path.startswith("/api/branch-ops"):
                code, payload = branch_ops.handle_request("GET", path, query=qs)
                self._json(code, payload)
                return

            if path in ("/api/audit", "/api/persist", "/api/persist/meta") or path.startswith(
                "/api/customer-documents"
            ):
                with get_conn() as conn:
                    code, payload = persist.handle_request(
                        "GET",
                        path,
                        query=qs,
                        conn=conn,
                        client_ip=self.client_address[0] if self.client_address else None,
                        user_agent=self.headers.get("User-Agent"),
                    )
                if payload.get("_file") and code == 200:
                    try:
                        raw = Path(payload["_file"]).read_bytes()
                    except OSError as e:
                        self._json(404, {"ok": False, "error": str(e), "code": "file_missing"})
                        return
                    mime = payload.get("mime") or "application/octet-stream"
                    self._send(200, raw, mime)
                    return
                self._json(code, payload)
                return

            if path == "/data":
                with get_conn() as conn:
                    counts = fetch_counts(conn)
                    data = fetch_data(conn)
                html = render_data_html(data, counts).encode("utf-8")
                self._send(200, html, "text/html; charset=utf-8")
                return
            self._json(404, {"ok": False, "error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(e)})

    def _read_json_body(self, max_bytes: int = 65536) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > max_bytes:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))


    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if path in ("/api/sms-panel/settings", "/api/sms/settings"):
                try:
                    body = self._read_json_body()
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                result = sms_panel.panel_settings_put(body if isinstance(body, dict) else {})
                code = 200 if result.get("ok") else 400
                self._json(code, result)
                return
            if path.startswith("/api/sima-zar"):
                try:
                    body = self._read_json_body()
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                code, payload = sima_zar.handle_request(
                    "PUT", path, body if isinstance(body, dict) else {}
                )
                self._json(code, payload)
                return
            if path.startswith("/api/sanhab"):
                try:
                    body = self._read_json_body()
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                code, payload = sanhab.handle_request(
                    "PUT", path, body if isinstance(body, dict) else {}
                )
                self._json(code, payload)
                return
            self._json(404, {"ok": False, "error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(e)})

    def do_PATCH(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        try:
            if path.startswith("/api/sales-network"):
                try:
                    body = self._read_json_body()
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                code, payload = sales_network.handle_request(
                    "PATCH", path, body if isinstance(body, dict) else {}
                )
                self._json(code, payload)
                return
            if path.startswith("/api/customers/"):
                try:
                    body = self._read_json_body()
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                with get_conn() as conn:
                    code, payload = persist.handle_request(
                        "PATCH",
                        path,
                        body if isinstance(body, dict) else {},
                        conn=conn,
                        client_ip=self.client_address[0] if self.client_address else None,
                        user_agent=self.headers.get("User-Agent"),
                    )
                self._json(code, payload)
                return
            self._json(404, {"ok": False, "error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(e)})

    def do_DELETE(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        try:
            if path.startswith("/api/customer-documents/") or (
                path.startswith("/api/customers/") and "/documents/" in path
            ):
                with get_conn() as conn:
                    code, payload = persist.handle_request(
                        "DELETE",
                        path,
                        conn=conn,
                        client_ip=self.client_address[0] if self.client_address else None,
                        user_agent=self.headers.get("User-Agent"),
                    )
                self._json(code, payload)
                return
            self._json(404, {"ok": False, "error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(e)})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path.startswith("/api/sales-network"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = sales_network.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return
        if path.startswith("/api/sima-zar"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = sima_zar.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return
        if path.startswith("/api/omid-pension"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = omid_pension.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        if path.startswith("/api/group-health"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = group_health.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        if path.startswith("/api/sanhab"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = sanhab.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        # DMS durable file upload/delete — before stub /api/dms (needs larger body)
        if path.startswith("/api/dms/files") and documents_module is not None:
            # POST /api/dms/files/{id}/delete
            if path.endswith("/delete"):
                doc_id = unquote(path[len("/api/dms/files/") : -len("/delete")]).strip().strip("/")
                actor = (self.headers.get("X-Actor") or "").strip()
                with get_conn() as conn:
                    documents_module.ensure_table(conn)
                    ok = documents_module.soft_delete(conn, doc_id, actor)
                self._json(200 if ok else 404, {"ok": ok, "deleted": ok, "durable": True})
                return
            # POST /api/dms/files
            if path.rstrip("/") == "/api/dms/files":
                try:
                    body = self._read_json_body(max_bytes=12_000_000)
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                if not isinstance(body, dict):
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                body = _normalize_document_upload_body(body)
                key = _dms_files_customer_key(body=body)
                if not key:
                    self._json(400, {"ok": False, "error": "customerId یا policyholderCode الزامی است"})
                    return
                actor = (self.headers.get("X-Actor") or body.get("uploadedBy") or "").strip()
                try:
                    with get_conn() as conn:
                        documents_module.ensure_table(conn)
                        row = documents_module.save_document(
                            conn, customer_id=key, body=body, actor=actor
                        )
                    self._json(200, {
                        "ok": True,
                        "document": row,
                        "durable": True,
                        "demoStub": False,
                        "documentsRoot": getattr(documents_module, "DOCUMENTS_ROOT", "/opt/fasihi/documents"),
                    })
                except documents_module.DocumentError as e:
                    self._json(400, {"ok": False, "error": str(e)})
                return
            self._json(404, {"ok": False, "error": "not found"})
            return

        if path.startswith("/api/dms"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = dms.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        if path.startswith("/api/loyalty"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = loyalty.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        if path.startswith("/api/branch-ops"):
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            code, payload = branch_ops.handle_request(
                "POST", path, body if isinstance(body, dict) else {}
            )
            self._json(code, payload)
            return

        # Live Import documents: POST upload + soft-delete
        if documents_module is not None:
            if path.startswith("/api/customers/") and path.rstrip("/").endswith("/documents"):
                key = unquote(path[len("/api/customers/") : -len("/documents")]).strip().rstrip("/")
                try:
                    body = self._read_json_body(max_bytes=12_000_000)
                except Exception:
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                if not isinstance(body, dict):
                    self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                    return
                # Accept Eng persist field aliases
                if "content" not in body and "base64" not in body:
                    if body.get("contentBase64"):
                        body = {**body, "content": body.get("contentBase64")}
                if "title" not in body and body.get("fileTitle"):
                    body = {**body, "title": body.get("fileTitle")}
                if "fileName" not in body and body.get("filename"):
                    body = {**body, "fileName": body.get("filename")}
                actor = (self.headers.get("X-Actor") or body.get("uploadedBy") or "").strip()
                try:
                    with get_conn() as conn:
                        documents_module.ensure_table(conn)
                        row = documents_module.save_document(
                            conn, customer_id=key, body=body, actor=actor
                        )
                    self._json(200, {"ok": True, "document": row})
                except documents_module.DocumentError as e:
                    self._json(400, {"ok": False, "error": str(e)})
                return
            if path.startswith("/api/documents/") and path.endswith("/delete"):
                doc_id = unquote(path[len("/api/documents/") : -len("/delete")]).strip()
                actor = (self.headers.get("X-Actor") or "").strip()
                with get_conn() as conn:
                    documents_module.ensure_table(conn)
                    ok = documents_module.soft_delete(conn, doc_id, actor)
                self._json(200 if ok else 404, {"ok": ok, "deleted": ok})
                return

        if (
            path in (
                "/api/installments/payment",
                "/api/installments/payments",
                "/api/customer-documents",
                "/api/renewals/mark",
                "/api/renewals/renewed",
                "/api/policies/renewed",
            )
            or (path.startswith("/api/installments/") and path.endswith("/payments"))
            or (path.startswith("/api/policies/") and path.endswith("/renewed"))
            or path.startswith("/api/customer-documents")
            or (path.startswith("/api/customers/") and path.rstrip("/").endswith("/documents"))
        ):
            try:
                body = self._read_json_body(max_bytes=2_000_000)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            with get_conn() as conn:
                code, payload = persist.handle_request(
                    "POST",
                    path,
                    body if isinstance(body, dict) else {},
                    conn=conn,
                    client_ip=self.client_address[0] if self.client_address else None,
                    user_agent=self.headers.get("User-Agent"),
                )
            self._json(code, payload)
            return
        if path == "/api/admin/backfill-holder-code":
            try:
                body = self._read_json_body()
            except Exception:
                body = {}
            if not isinstance(body, dict):
                body = {}
            token = (
                self.headers.get("X-Admin-Token")
                or self.headers.get("x-admin-token")
                or body.get("token")
                or body.get("adminToken")
                or ""
            )
            dry_run = True
            if "dryRun" in body or "dry_run" in body:
                dry_run = as_bool(body.get("dryRun") if "dryRun" in body else body.get("dry_run"))
            # Apply requires configured ADMIN_TOKEN; dry-run is always allowed.
            if not dry_run and not admin_token_ok(token):
                self._json(
                    403,
                    {
                        "ok": False,
                        "error": "نیاز به ADMIN_TOKEN برای اعمال backfill",
                        "code": "admin_token_required",
                        "dryRun": False,
                    },
                )
                return
            try:
                with get_conn() as conn:
                    report = apply_holder_code_backfill(conn, dry_run=dry_run)
                # Never return the full update list on the wire (can be large).
                public = {k: v for k, v in report.items() if k != "updates"}
                self._json(200, public)
            except Exception as e:
                traceback.print_exc()
                self._json(500, {"ok": False, "error": str(e), "dryRun": dry_run})
            return
        if path in ("/api/calc/diya", "/api/diya"):
            # Same locked payload as GET (optional POST for clients that prefer it).
            self._json(200, dict(DIYA_1405_VERIFIED))
            return
        if path in ("/api/calc/premium-adjustment", "/api/premium-adjustment"):
            # Always JSON — never HTML — even on bad/empty body.
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر", "code": "invalid_json"})
                return
            if not isinstance(body, dict):
                body = {}
            rows, err = parse_premium_adjustment_body(body)
            if err:
                self._json(400, {"ok": False, "error": err, "code": "invalid_params"})
                return
            # Wire: [{year, jalaliYear, premiumRial, premiumToman}, ...]
            # each year = 12-month Jalali insurance year; jalaliYear = startYear + n - 1
            self._json(200, rows)
            return

        if path in ("/api/sms-panel/test-connection", "/api/sms/test-connection"):
            # Alias /api/sms/test-connection → same panel handler (live; SMS_DRY_RUN=0).
            result = sms_panel.panel_test_connection()
            code = 200 if result.get("ok") or result.get("connected") else 503
            self._json(code, result)
            return
        if path in ("/api/sms-panel/send", "/api/sms/send"):
            # Prefer sms-panel; alias /api/sms/send → panel_send (SMS_DRY_RUN from env).
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            result = sms_panel.panel_send(body if isinstance(body, dict) else {})
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path in ("/api/sms-panel/send-pattern", "/api/sms/send-pattern"):
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            result = sms_panel.panel_send_pattern(body if isinstance(body, dict) else {})
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path in ("/api/sms-panel/reply", "/api/sms/reply"):
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            result = sms_panel.panel_reply(body if isinstance(body, dict) else {})
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path == "/api/urgent-tasks":
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            result = sms_panel.create_urgent_task(body if isinstance(body, dict) else {})
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path == "/api/urgent-tasks/update":
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            result = sms_panel.update_urgent_task(body if isinstance(body, dict) else {})
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path == "/api/urgent-tasks/open":
            try:
                body = self._read_json_body()
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            tid = str((body or {}).get("id") or "")
            result = sms_panel.mark_urgent_opened(tid)
            code = 200 if result.get("ok") else 400
            self._json(code, result)
            return
        if path == "/api/premium-compare/quote":
            try:
                body = self._read_json_body(max_bytes=65_536)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر", "offers": []})
                return
            result = quote_premium(body if isinstance(body, dict) else {})
            public = {k: v for k, v in result.items() if not str(k).startswith("_")}
            code = 200
            if not result.get("ok"):
                err_code = str(result.get("code") or "")
                if err_code == "bimebazar_env_missing":
                    code = 503
                elif err_code in ("invalid_plate", "invalid_national_id", "invalid_line"):
                    code = 400
                elif err_code in ("sanhab_failed", "offers_empty"):
                    code = 422
                else:
                    code = 502
            self._json(code, public)
            return
        if path == "/api/premium-ai/chat":
            try:
                body = self._read_json_body(max_bytes=200_000)
            except Exception:
                self._json(400, {"ok": False, "error": "بدنه نامعتبر"})
                return
            try:
                messages = coerce_premium_ai_messages(body if isinstance(body, dict) else {})
                result = send_premium_ai_chat(messages)
            except Exception:
                traceback.print_exc()
                result = {
                    "ok": False,
                    "error": "خطای داخلی مشاور",
                    "code": "premium_ai_internal",
                }
            public = {k: v for k, v in result.items() if not str(k).startswith("_")}
            code = 200 if result.get("ok") else (503 if result.get("code") == "premium_ai_env_missing" else 502)
            self._json(code, public)
            return
        self._json(404, {"ok": False, "error": "not found"})


def main():
    print(f"Fasihi API listening on {HOST}:{PORT}", flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
