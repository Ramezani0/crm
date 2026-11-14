"""Iran Payamak SMS module — stdlib only. Never logs or returns secrets.

Credentials come from process env:
  IRANPAYAMAK_USERNAME, IRANPAYAMAK_PASSWORD,
  IRANPAYAMAK_LINE / IRANPAYAMAK_LINE_NUMBER / LINE_NUMBER,
  IRANPAYAMAK_API_KEY
Optional: IRANPAYAMAK_API_BASE, FASIHI_SMS_STORE
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

IRANPAYAMAK_DEFAULT_BASE = "https://api.iranpayamak.com"
SMS_ENV_ERROR = "نیاز به env / API"

STATUS_DONE = "انجام‌شد"
STATUS_NOT_DONE = "نشد"
STATUS_IN_PROGRESS = "درحال‌انجام"
ESSENTIAL_STATUSES = (STATUS_DONE, STATUS_NOT_DONE, STATUS_IN_PROGRESS)
DEFAULT_TASK_STATUS = STATUS_NOT_DONE

# Inbound SMS may create essential tasks only from these numbers (after 09xxxxxxxxx normalize).
SMS_INBOUND_WHITELIST = (
    "09133938543",
    "09138917291",
    "09180089780",
    "09213908586",
    "09120973209",
    "09386674005",
)

SITE_CHANGE_NOTIFY_MOBILE = "09138917291"

SITE_CHANGE_EVENTS = (
    "customer_create",
    "policy_edit",
    "settings_save",
    "staff_login",  # hook reserved — frontend does not fire until staff auth is live
)

_DIGIT_TRANS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_store_lock = threading.Lock()
_token_cache: dict[str, str | float] = {"token": "", "at": 0.0}


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def line_number() -> str:
    return (
        _env("IRANPAYAMAK_LINE")
        or _env("IRANPAYAMAK_LINE_NUMBER")
        or _env("LINE_NUMBER")
        or _env("IRANPAYAMAK_FROM")
    )


def api_base() -> str:
    return (_env("IRANPAYAMAK_API_BASE") or IRANPAYAMAK_DEFAULT_BASE).rstrip("/")


def store_path() -> Path:
    raw = _env("FASIHI_SMS_STORE")
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parent / "sms-store.json"


def normalize_mobile(raw) -> str:
    s = str(raw or "").strip().translate(_DIGIT_TRANS)
    s = re.sub(r"\D", "", s)
    if s.startswith("0098"):
        s = s[4:]
    if s.startswith("98") and len(s) >= 12:
        s = s[2:]
    if s.startswith("9") and len(s) == 10:
        s = "0" + s
    if re.fullmatch(r"09\d{9}", s):
        return s
    return ""


def is_whitelisted_mobile(raw) -> bool:
    n = normalize_mobile(raw)
    return bool(n) and n in SMS_INBOUND_WHITELIST


def iranpayamak_config() -> dict:
    key = _env("IRANPAYAMAK_API_KEY")
    username = _env("IRANPAYAMAK_USERNAME")
    password = _env("IRANPAYAMAK_PASSWORD")
    line = line_number()
    can_auth = bool(key) or bool(username and password)
    configured = bool(can_auth and line)
    return {
        "ok": True,
        "provider": "iranpayamak",
        "configured": configured,
        "apiBase": api_base(),
        "hasApiKey": bool(key),
        "hasUsername": bool(username),
        "hasPassword": bool(password),
        "hasLineNumber": bool(line),
        "usernameSet": bool(username),
        "fromNumberSet": bool(line),
        "notifyMobile": SITE_CHANGE_NOTIFY_MOBILE,
        "inboundWhitelist": list(SMS_INBOUND_WHITELIST),
        "taskStatuses": list(ESSENTIAL_STATUSES),
        "error": None if configured else SMS_ENV_ERROR,
        "_api_key": key,
        "_username": username,
        "_password": password,
        "_line_number": line,
    }


def sms_status_public() -> dict:
    cfg = iranpayamak_config()
    return {k: v for k, v in cfg.items() if not k.startswith("_")}


def _extract_token(parsed) -> str:
    if not isinstance(parsed, dict):
        return ""
    data = parsed.get("data") if isinstance(parsed.get("data"), dict) else parsed
    for key in ("token", "access_token", "accessToken", "apiKey", "api_key"):
        val = data.get(key) if isinstance(data, dict) else None
        if isinstance(val, str) and val.strip():
            return val.strip()
        top = parsed.get(key)
        if isinstance(top, str) and top.strip():
            return top.strip()
    return ""


def _login_token(cfg: dict) -> str:
    cached = str(_token_cache.get("token") or "")
    at = float(_token_cache.get("at") or 0)
    if cached and (time.time() - at) < 3000:
        return cached
    user = cfg.get("_username") or ""
    password = cfg.get("_password") or ""
    if not user or not password:
        return ""
    payload = json.dumps(
        {"username": user, "password": password, "method": None},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{cfg['apiBase']}/ws/v1/auth/login",
        data=payload,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body) if body else {}
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return ""
    token = _extract_token(parsed)
    if token:
        _token_cache["token"] = token
        _token_cache["at"] = time.time()
    return token


def _auth_headers(cfg: dict) -> dict | None:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if cfg.get("_api_key"):
        headers["Api-Key"] = cfg["_api_key"]
        return headers
    token = _login_token(cfg)
    if not token:
        return None
    headers["Api-Key"] = token
    headers["Authorization"] = f"Bearer {token}"
    return headers


def send_iranpayamak(text: str, recipients: list[str]) -> dict:
    cfg = iranpayamak_config()
    if not cfg["configured"]:
        return {"ok": False, "error": SMS_ENV_ERROR, "code": "sms_env_missing", "stub": True}
    dest = []
    for raw in recipients:
        n = normalize_mobile(raw)
        if n and n not in dest:
            dest.append(n)
        if len(dest) >= 20:
            break
    if not dest:
        return {"ok": False, "error": "شماره موبایل معتبر نیست", "code": "sms_bad_recipient"}
    body_text = (text or "").strip()
    if not body_text or len(body_text) > 900:
        return {"ok": False, "error": "متن پیامک نامعتبر است", "code": "sms_bad_text"}
    headers = _auth_headers(cfg)
    if not headers:
        return {"ok": False, "error": SMS_ENV_ERROR, "code": "sms_auth_failed", "stub": True}
    payload = json.dumps(
        {
            "text": body_text,
            "line_number": cfg["_line_number"],
            "recipients": dest,
            "number_format": "english",
            "schedule": None,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{cfg['apiBase']}/ws/v1/sms/simple",
        data=payload,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {}
            ok = True
            if isinstance(parsed, dict) and str(parsed.get("status", "")).lower() == "error":
                ok = False
            return {
                "ok": ok,
                "provider": "iranpayamak",
                "stub": False,
                "error": None if ok else "ارسال پیامک ناموفق بود",
            }
    except urllib.error.HTTPError:
        return {"ok": False, "error": "ارسال پیامک ناموفق بود", "code": "sms_http_error"}
    except Exception:
        return {"ok": False, "error": "ارسال پیامک ناموفق بود", "code": "sms_network_error"}


def notify_site_change(event: str, summary: str) -> dict:
    ev = (event or "").strip()
    if ev not in SITE_CHANGE_EVENTS:
        return {"ok": False, "error": "رویداد نامعتبر است", "code": "sms_bad_event"}
    text = format_site_change_sms(ev, summary)
    if not text:
        return {"ok": False, "error": "متن اعلان خالی است", "code": "sms_bad_text"}
    result = send_iranpayamak(text, [SITE_CHANGE_NOTIFY_MOBILE])
    result["event"] = ev
    result["to"] = SITE_CHANGE_NOTIFY_MOBILE
    return result


def format_site_change_sms(event: str, summary: str) -> str:
    labels = {
        "customer_create": "مشتری جدید",
        "policy_edit": "ویرایش بیمه‌نامه",
        "settings_save": "ذخیره تنظیمات",
        "staff_login": "ورود کارکنان",
    }
    label = labels.get(event, event)
    detail = (summary or "").strip()
    if not detail:
        return ""
    return f"CRM فصیحی — {label}: {detail}"[:700]


def _empty_store() -> dict:
    return {"tasks": [], "urgentTasks": [], "inbox": []}


def load_store() -> dict:
    path = store_path()
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return _empty_store()
        tasks = data.get("tasks")
        if not isinstance(tasks, list):
            tasks = []
        cleaned = []
        for row in tasks:
            if isinstance(row, dict) and row.get("id") and row.get("from"):
                cleaned.append(row)
        urgent = data.get("urgentTasks") if isinstance(data.get("urgentTasks"), list) else []
        inbox = data.get("inbox") if isinstance(data.get("inbox"), list) else []
        return {"tasks": cleaned, "urgentTasks": urgent, "inbox": inbox}
    except FileNotFoundError:
        return _empty_store()
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return _empty_store()


def save_store(data: dict) -> None:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)


def list_tasks() -> list[dict]:
    with _store_lock:
        tasks = load_store()["tasks"]
    return sorted(tasks, key=lambda t: str(t.get("at") or ""), reverse=True)


def _task_id(frm: str, body: str, at: str, explicit: str = "") -> str:
    if explicit:
        return explicit.strip()[:120]
    return f"SMS-{frm}-{at}-{body[:24]}"


def essential_task_from_sms(payload: dict) -> dict | None:
    frm = normalize_mobile(
        payload.get("from")
        or payload.get("fromNum")
        or payload.get("sender")
        or payload.get("mobile")
    )
    if not frm or not is_whitelisted_mobile(frm):
        return None
    body = str(
        payload.get("text")
        or payload.get("message")
        or payload.get("body")
        or payload.get("msg")
        or ""
    ).strip()
    if not body:
        return None
    at = str(
        payload.get("recievedAt")
        or payload.get("receivedAt")
        or payload.get("at")
        or payload.get("date")
        or iso_now()
    )
    explicit = str(payload.get("id") or payload.get("messageId") or "")
    return {
        "id": _task_id(frm, body, at, explicit),
        "from": frm,
        "body": body[:2000],
        "at": at,
        "status": DEFAULT_TASK_STATUS,
        "source": "sms",
    }


def ingest_inbound(payload: dict) -> dict:
    task = essential_task_from_sms(payload or {})
    if not task:
        return {"ok": True, "accepted": False, "reason": "not_whitelisted"}
    with _store_lock:
        store = load_store()
        existing = {str(t.get("id")): t for t in store["tasks"]}
        if task["id"] in existing:
            prev = existing[task["id"]]
            return {"ok": True, "accepted": True, "duplicate": True, "task": prev}
        store["tasks"] = [task, *store["tasks"]][:500]
        save_store(store)
    return {"ok": True, "accepted": True, "duplicate": False, "task": task}


def set_task_status(task_id: str, status: str) -> dict:
    tid = (task_id or "").strip()
    st = (status or "").strip()
    if st not in ESSENTIAL_STATUSES:
        return {"ok": False, "error": "وضعیت نامعتبر است"}
    if not tid:
        return {"ok": False, "error": "شناسه نامعتبر است"}
    with _store_lock:
        store = load_store()
        found = False
        next_tasks = []
        updated = None
        for row in store["tasks"]:
            if str(row.get("id")) == tid:
                found = True
                updated = {**row, "status": st}
                next_tasks.append(updated)
            else:
                next_tasks.append(row)
        if not found:
            return {"ok": False, "error": "وظیفه پیدا نشد"}
        store["tasks"] = next_tasks
        save_store(store)
    return {"ok": True, "task": updated}


def fetch_iranpayamak_inbox() -> dict:
    cfg = iranpayamak_config()
    if not cfg["configured"]:
        return {"ok": True, "stub": True, "messages": [], "ingested": 0, "skipped": 0, "todo": SMS_ENV_ERROR}
    headers = _auth_headers(cfg)
    if not headers:
        return {
            "ok": False,
            "stub": True,
            "messages": [],
            "ingested": 0,
            "skipped": 0,
            "error": SMS_ENV_ERROR,
        }
    url = f"{cfg['apiBase']}/ws/v1/inbox?page=1&limit=50"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else {}
    except urllib.error.HTTPError:
        return {"ok": False, "messages": [], "ingested": 0, "skipped": 0, "error": "خواندن صندوق ناموفق بود"}
    except Exception:
        return {"ok": False, "messages": [], "ingested": 0, "skipped": 0, "error": "خواندن صندوق ناموفق بود"}

    items = []
    if isinstance(parsed, dict):
        data = parsed.get("data") if isinstance(parsed.get("data"), dict) else parsed
        raw_items = data.get("items") if isinstance(data, dict) else None
        if raw_items is None:
            raw_items = parsed.get("items") or parsed.get("messages") or []
    elif isinstance(parsed, list):
        raw_items = parsed
    else:
        raw_items = []
    if not isinstance(raw_items, list):
        raw_items = []

    ingested = 0
    skipped = 0
    messages = []
    for row in raw_items:
        if not isinstance(row, dict):
            continue
        result = ingest_inbound(row)
        sender = normalize_mobile(row.get("from") or row.get("sender") or "")
        text = str(row.get("text") or row.get("body") or "")
        at = str(row.get("recievedAt") or row.get("receivedAt") or row.get("at") or "")
        if result.get("accepted"):
            ingested += 1
            messages.append(
                {
                    "id": (result.get("task") or {}).get("id"),
                    "from": sender,
                    "body": text,
                    "at": at,
                }
            )
        else:
            skipped += 1
    return {
        "ok": True,
        "stub": False,
        "messages": messages,
        "ingested": ingested,
        "skipped": skipped,
        "tasks": list_tasks(),
    }


def extract_inbound_fields(source: dict) -> dict:
    """Normalize query/json/form keys used by Iran Payamak panels."""
    if not isinstance(source, dict):
        return {}
    out = {}
    for key, val in source.items():
        if isinstance(val, list):
            val = val[0] if val else ""
        out[str(key)] = val
    return out
