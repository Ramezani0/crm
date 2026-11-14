"""SMS panel + urgent tasks for Iran Payamak. Stdlib only. Never log/return secrets."""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import sms

DEFAULT_STAFF_NUMBERS = list(sms.SMS_INBOUND_WHITELIST)

URGENT_IN_REVIEW = "in_review"
URGENT_IN_PROGRESS = "in_progress"
URGENT_DONE = "done"
URGENT_STATUSES = (URGENT_IN_REVIEW, URGENT_IN_PROGRESS, URGENT_DONE)
URGENT_LABELS = {
    URGENT_IN_REVIEW: "درحال بررسی",
    URGENT_IN_PROGRESS: "درحال انجام",
    URGENT_DONE: "انجام شد",
}
URGENT_SMS = {
    URGENT_IN_REVIEW: "کار ضروری در حال بررسی است: {title}",
    URGENT_IN_PROGRESS: "کار ضروری در حال اجرا است: {title}",
    URGENT_DONE: "کار ضروری انجام شد: {title}",
}
URGENT_UNSEEN_SMS = "کار دیده نشده — پیگیری مجدد کنید: {title}"
URGENT_UNSEEN_MINUTES = 10


def sms_dry_run_enabled() -> bool:
    raw = (os.environ.get("SMS_DRY_RUN") or "0").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _secrets_path() -> Path:
    raw = (os.environ.get("FASIHI_SMS_SECRETS") or "").strip()
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parent / "sms-panel-secrets.json"


def _xor_key() -> bytes:
    return (os.environ.get("FASIHI_SMS_SECRETS_KEY") or "fasihi-sms-panel-v1").encode("utf-8")


def _obfuscate(value: str) -> str:
    raw = (value or "").encode("utf-8")
    key = _xor_key()
    xored = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw))
    return base64.urlsafe_b64encode(xored).decode("ascii")


def _deobfuscate(value: str) -> str:
    if not value:
        return ""
    try:
        xored = base64.urlsafe_b64decode(value.encode("ascii"))
    except Exception:
        return ""
    key = _xor_key()
    raw = bytes(b ^ key[i % len(key)] for i, b in enumerate(xored))
    try:
        return raw.decode("utf-8")
    except Exception:
        return ""


def _mask(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    if len(s) <= 4:
        return "****"
    return f"{s[:2]}***{s[-2:]}"


def _mask_mobile(value: str) -> str:
    s = sms.normalize_mobile(value) or (value or "")
    if len(s) < 7:
        return "***"
    return f"{s[:4]}***{s[-2:]}"


def _load_secrets() -> dict:
    path = _secrets_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {}


def _save_secrets(data: dict) -> None:
    path = _secrets_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _staff_from(raw_list) -> list[str]:
    out: list[str] = []
    if not isinstance(raw_list, list):
        return list(DEFAULT_STAFF_NUMBERS)
    for raw in raw_list:
        n = sms.normalize_mobile(raw)
        if n and n not in out:
            out.append(n)
    return out or list(DEFAULT_STAFF_NUMBERS)


def merged_creds() -> dict:
    file_data = _load_secrets()
    username = _deobfuscate(str(file_data.get("username_enc") or "")) or sms._env(
        "IRANPAYAMAK_USERNAME"
    )
    password = _deobfuscate(str(file_data.get("password_enc") or "")) or sms._env(
        "IRANPAYAMAK_PASSWORD"
    )
    api_key = _deobfuscate(str(file_data.get("api_key_enc") or "")) or sms._env(
        "IRANPAYAMAK_API_KEY"
    )
    sender = str(file_data.get("sender") or "").strip() or sms.line_number()
    base = str(file_data.get("api_base") or "").strip() or sms.api_base()
    staff = _staff_from(file_data.get("staff_numbers"))
    can_auth = bool(api_key) or bool(username and password)
    return {
        "username": username,
        "password": password,
        "api_key": api_key,
        "sender": sender,
        "api_base": base.rstrip("/"),
        "staff_numbers": staff,
        "configured": bool(can_auth and sender),
        "has_username": bool(username),
        "has_password": bool(password),
        "has_api_key": bool(api_key),
        "has_sender": bool(sender),
    }


def panel_settings_get() -> dict:
    c = merged_creds()
    return {
        "ok": True,
        "provider": "iranpayamak",
        "providerUrl": "https://iranpayamak.com/",
        "dryRun": sms_dry_run_enabled(),
        "configured": c["configured"],
        "apiBase": c["api_base"],
        "usernameMasked": _mask(c["username"]),
        "passwordMasked": "****" if c["has_password"] else "",
        "apiKeyMasked": _mask(c["api_key"]),
        "sender": c["sender"],
        "hasUsername": c["has_username"],
        "hasPassword": c["has_password"],
        "hasApiKey": c["has_api_key"],
        "hasSender": c["has_sender"],
        "staffNumbers": list(c["staff_numbers"]),
        "envNames": [
            "IRANPAYAMAK_USERNAME",
            "IRANPAYAMAK_PASSWORD",
            "IRANPAYAMAK_API_KEY",
            "IRANPAYAMAK_LINE",
            "IRANPAYAMAK_LINE_NUMBER",
            "IRANPAYAMAK_API_BASE",
            "SMS_DRY_RUN",
        ],
    }


def panel_settings_put(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    current = _load_secrets()
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or payload.get("token") or "").strip()
    api_key = str(payload.get("apiKey") or payload.get("api_key") or "").strip()
    sender = str(payload.get("sender") or payload.get("fromNumber") or "").strip()
    base = str(payload.get("apiBase") or payload.get("api_base") or "").strip()
    staff_raw = payload.get("staffNumbers") or payload.get("staff_numbers")
    if username:
        current["username_enc"] = _obfuscate(username)
    if password:
        current["password_enc"] = _obfuscate(password)
    if api_key:
        current["api_key_enc"] = _obfuscate(api_key)
    if sender:
        current["sender"] = sender
    if base:
        current["api_base"] = base.rstrip("/")
    if isinstance(staff_raw, list):
        current["staff_numbers"] = _staff_from(staff_raw)
    current["updatedAt"] = sms.iso_now()
    _save_secrets(current)
    return {"ok": True, "settings": panel_settings_get()}


def _auth_headers_for(creds: dict) -> dict | None:
    cfg = {
        "apiBase": creds["api_base"],
        "_api_key": creds.get("api_key") or "",
        "_username": creds.get("username") or "",
        "_password": creds.get("password") or "",
        "_line_number": creds.get("sender") or "",
    }
    return sms._auth_headers(cfg)


def panel_test_connection() -> dict:
    creds = merged_creds()
    if not (creds["has_api_key"] or (creds["has_username"] and creds["has_password"])):
        return {
            "ok": False,
            "connected": False,
            "message": "مدارک ایران پیامک تنظیم نشده — ابتدا نام کاربری/کلید و رمز را ذخیره کنید.",
            "code": "sms_env_missing",
        }
    headers = _auth_headers_for(creds)
    if not headers:
        return {
            "ok": False,
            "connected": False,
            "message": "ورود به ایران پیامک ناموفق بود — مدارک را بررسی کنید.",
            "code": "sms_auth_failed",
        }
    req = urllib.request.Request(
        f"{creds['api_base']}/ws/v1/user/credit",
        headers=headers,
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            _ = resp.read()
        return {
            "ok": True,
            "connected": True,
            "message": "اتصال به ایران پیامک برقرار است.",
            "code": "sms_connected",
        }
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return {
                "ok": False,
                "connected": False,
                "message": "احراز هویت ایران پیامک رد شد.",
                "code": "sms_auth_rejected",
            }
        return {
            "ok": True,
            "connected": True,
            "message": "احراز هویت موفق بود (پاسخ سرویس اعتبار ناقص است).",
            "code": "sms_auth_ok",
        }
    except Exception:
        return {
            "ok": False,
            "connected": False,
            "message": "ارتباط با سرور ایران پیامک برقرار نشد.",
            "code": "sms_network_error",
        }


def dispatch_send(text: str, recipients: list[str], *, force_live: bool = False) -> dict:
    dest: list[str] = []
    for raw in recipients:
        n = sms.normalize_mobile(raw)
        if n and n not in dest:
            dest.append(n)
        if len(dest) >= 20:
            break
    body = (text or "").strip()
    if not body or len(body) > 900:
        return {"ok": False, "error": "متن پیامک نامعتبر است", "code": "sms_bad_text"}
    if not dest:
        return {"ok": False, "error": "شماره موبایل معتبر نیست", "code": "sms_bad_recipient"}
    if sms_dry_run_enabled() and not force_live:
        print(
            f"[SMS_DRY_RUN] to={','.join(dest)} len={len(body)} text={body[:80]!r}",
            flush=True,
        )
        return {
            "ok": True,
            "dryRun": True,
            "provider": "iranpayamak",
            "code": "sms_dry_run",
            "recipientCount": len(dest),
            "recipientsMasked": [_mask_mobile(x) for x in dest],
            "message": "حالت آزمایشی فعال است — پیامک واقعی ارسال نشد.",
        }
    result = sms.send_iranpayamak(body, dest)
    if isinstance(result, dict):
        result = {**result, "dryRun": False}
    return result


def panel_send(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    text = str(payload.get("text") or payload.get("body") or "").strip()
    recipients = payload.get("recipients") or payload.get("to") or []
    if isinstance(recipients, str):
        recipients = [recipients]
    if not isinstance(recipients, list):
        recipients = []
    return dispatch_send(text, recipients)


def panel_send_pattern(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    pattern = str(
        payload.get("pattern") or payload.get("patternId") or payload.get("code") or ""
    ).strip()
    if not pattern:
        return {"ok": False, "error": "شناسه پترن خالی است", "code": "sms_bad_pattern"}
    recipients = payload.get("recipients") or payload.get("to") or []
    if isinstance(recipients, str):
        recipients = [recipients]
    params = payload.get("params") or payload.get("tokens") or {}
    if not isinstance(params, dict):
        params = {}
    parts = [f"{k}={v}" for k, v in params.items()]
    text = f"[pattern:{pattern}] " + " ".join(parts)
    result = dispatch_send(text.strip(), recipients if isinstance(recipients, list) else [])
    result["pattern"] = pattern
    return result


def _read_extended() -> dict:
    data = sms.load_store()
    tasks = data.get("tasks") if isinstance(data.get("tasks"), list) else []
    urgent = data.get("urgentTasks") if isinstance(data.get("urgentTasks"), list) else []
    inbox = data.get("inbox") if isinstance(data.get("inbox"), list) else []
    return {"tasks": tasks, "urgentTasks": urgent, "inbox": inbox}


def _write_extended(store: dict) -> None:
    sms.save_store(
        {
            "tasks": store.get("tasks") or [],
            "urgentTasks": store.get("urgentTasks") or [],
            "inbox": store.get("inbox") or [],
        }
    )


def panel_inbox() -> dict:
    dry = sms_dry_run_enabled()
    creds = merged_creds()
    if not creds["configured"]:
        with sms._store_lock:
            cached = _read_extended().get("inbox") or []
        return {
            "ok": True,
            "stub": True,
            "dryRun": dry,
            "messages": cached,
            "message": sms.SMS_ENV_ERROR,
        }
    fetched = sms.fetch_iranpayamak_inbox()
    messages = []
    for row in fetched.get("messages") or []:
        if isinstance(row, dict):
            messages.append(
                {
                    "id": str(row.get("id") or ""),
                    "from": str(row.get("from") or ""),
                    "body": str(row.get("body") or row.get("text") or ""),
                    "at": str(row.get("at") or sms.iso_now()),
                }
            )
    if messages:
        with sms._store_lock:
            store = _read_extended()
            store["inbox"] = messages[:100]
            _write_extended(store)
        return {"ok": True, "stub": False, "dryRun": dry, "messages": messages}
    with sms._store_lock:
        cached = _read_extended().get("inbox") or []
    return {
        "ok": True,
        "stub": True,
        "dryRun": dry,
        "messages": cached,
        "message": fetched.get("error")
        or fetched.get("todo")
        or "صندوق ورودی اسکلت — پاسخ ارائه‌دهنده خالی/نامشخص بود.",
    }


def panel_reply(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    to = payload.get("to") or payload.get("recipient") or payload.get("from")
    text = str(payload.get("text") or payload.get("body") or "").strip()
    return dispatch_send(text, [to] if to else [])


def _urgent_notify(status: str, title: str, staff: list[str] | None = None) -> dict:
    template = URGENT_SMS.get(status)
    if not template:
        return {"ok": False, "error": "وضعیت نامعتبر است"}
    text = template.format(title=(title or "").strip() or "—")
    dest = staff if staff is not None else merged_creds()["staff_numbers"]
    return dispatch_send(text, dest)


def process_urgent_reminders() -> dict:
    now = datetime.now(timezone.utc)
    pending: list[tuple[list[str], str]] = []
    with sms._store_lock:
        store = _read_extended()
        rows = store.get("urgentTasks") or []
        next_rows = []
        for row in rows:
            updated = dict(row)
            if (
                not updated.get("openedAt")
                and not updated.get("reminderSentAt")
                and updated.get("status") != URGENT_DONE
            ):
                created = str(updated.get("createdAt") or "")
                try:
                    created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except ValueError:
                    created_dt = now
                if (now - created_dt).total_seconds() / 60.0 >= URGENT_UNSEEN_MINUTES:
                    title = str(updated.get("title") or "—")
                    pending.append(
                        (
                            list(updated.get("assignees") or merged_creds()["staff_numbers"]),
                            URGENT_UNSEEN_SMS.format(title=title),
                        )
                    )
                    updated["reminderSentAt"] = sms.iso_now()
            next_rows.append(updated)
        store["urgentTasks"] = next_rows
        _write_extended(store)
    sent = 0
    for assignees, text in pending:
        dispatch_send(text, assignees)
        sent += 1
    return {"ok": True, "remindersSent": sent}


def list_urgent_tasks() -> list[dict]:
    process_urgent_reminders()
    with sms._store_lock:
        rows = _read_extended().get("urgentTasks") or []
    return sorted(rows, key=lambda t: str(t.get("createdAt") or ""), reverse=True)


def create_urgent_task(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    title = str(payload.get("title") or "").strip()
    body = str(payload.get("body") or payload.get("description") or "").strip()
    if not title:
        return {"ok": False, "error": "عنوان الزامی است"}
    related = payload.get("relatedEntity") or payload.get("related")
    if related is not None and not isinstance(related, dict):
        related = {"label": str(related)}
    assignees = payload.get("assignees") or payload.get("notifyList") or []
    if isinstance(assignees, str):
        assignees = [assignees]
    notify: list[str] = []
    for raw in assignees if isinstance(assignees, list) else []:
        n = sms.normalize_mobile(raw)
        if n and n not in notify:
            notify.append(n)
    if not notify:
        notify = list(merged_creds()["staff_numbers"])
    status = str(payload.get("status") or URGENT_IN_REVIEW).strip()
    if status not in URGENT_STATUSES:
        status = URGENT_IN_REVIEW
    now = sms.iso_now()
    task = {
        "id": str(payload.get("id") or f"UT-{int(datetime.now(timezone.utc).timestamp() * 1000)}"),
        "title": title[:200],
        "body": body[:4000],
        "relatedEntity": related,
        "assignees": notify,
        "status": status,
        "statusLabel": URGENT_LABELS[status],
        "openedAt": None,
        "reminderSentAt": None,
        "createdAt": now,
        "updatedAt": now,
        "unread": True,
    }
    with sms._store_lock:
        store = _read_extended()
        store["urgentTasks"] = [task, *(store.get("urgentTasks") or [])][:500]
        _write_extended(store)
    sms_result = _urgent_notify(status, title, notify)
    return {
        "ok": True,
        "task": task,
        "sms": {k: v for k, v in sms_result.items() if k != "recipients"},
    }


def update_urgent_task(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "error": "بدنه نامعتبر است"}
    tid = str(payload.get("id") or "").strip()
    if not tid:
        return {"ok": False, "error": "شناسه نامعتبر است"}
    status = payload.get("status")
    if status is not None:
        status = str(status).strip()
        if status not in URGENT_STATUSES:
            return {"ok": False, "error": "وضعیت نامعتبر است"}
    with sms._store_lock:
        store = _read_extended()
        rows = store.get("urgentTasks") or []
        found = None
        next_rows = []
        for row in rows:
            if str(row.get("id")) == tid:
                updated = dict(row)
                if status is not None:
                    updated["status"] = status
                    updated["statusLabel"] = URGENT_LABELS[status]
                if "title" in payload and str(payload.get("title") or "").strip():
                    updated["title"] = str(payload.get("title")).strip()[:200]
                if "body" in payload:
                    updated["body"] = str(payload.get("body") or "")[:4000]
                if payload.get("markOpened") or payload.get("opened"):
                    updated["openedAt"] = updated.get("openedAt") or sms.iso_now()
                    updated["unread"] = False
                updated["updatedAt"] = sms.iso_now()
                found = updated
                next_rows.append(updated)
            else:
                next_rows.append(row)
        if not found:
            return {"ok": False, "error": "کار پیدا نشد"}
        store["urgentTasks"] = next_rows
        _write_extended(store)
    sms_result = None
    if status is not None:
        sms_result = _urgent_notify(status, found.get("title") or "", found.get("assignees"))
    return {
        "ok": True,
        "task": found,
        "sms": ({k: v for k, v in sms_result.items() if k != "recipients"} if sms_result else None),
    }


def mark_urgent_opened(task_id: str) -> dict:
    return update_urgent_task({"id": task_id, "markOpened": True})
