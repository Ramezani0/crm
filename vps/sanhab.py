"""M5 سنهاب / بیمه مرکزی — Regulatory Sanhab Connector (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 006.
NEVER touches / wipes customers/policies/installments/M1–M4 tables.
Vehicle plate inquiry default = live via BimeBazar partners (inquiry_type=sanhab).
NOT official Central Insurance API — labelled BIMEBAZAR_PARTNER / «استعلام از طریق بیمه‌بازار».
DEMO stub only when explicitly toggled (demo=true or SANHAB_VEHICLE_SOURCE=demo).
Do NOT persist national ID / plate PII. No wipe. Never invent official Sanhab credentials.

Eng-only for this Excel batch (see ENG_MODULE_HANDOFF §4 Sanhab unique-code / VIN).
Accept future land shape: policy_number, computer_code, national_id, plate fields
in case_365 / پرونده_365, Jalali TEXT yyyy/mm/dd — no Gregorian.
Do NOT invent insurance_type outside locked Import enum.
Cite:
  ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
  MODULE_FORMULA_IMPORT_LOCKS_20260924.md
  KARAFARIN_CORE_MODULES_BRIEF_20260924.md §5
  research insurance-crm-modules-gemini-20260924.txt (~3675–3682, 523–532, 1578)

Features (DEMO stubs):
  1) Death-sum aggregation inquiry vs configurable industry ceiling
  2) Plate/VIN inquiry → NCD % TP/Body + accident history + کد یکتا
  3) Periodic issuance/endorsement/financial export queue → JSON/CSV bundle
"""
from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
import os
import re
import threading
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext
from pathlib import Path
from typing import Any

try:
    from sanhab_vehicle_provider import (
        SOURCE_BIMEBAZAR,
        SOURCE_LABEL_BIMEBAZAR,
        VEHICLE_INQUIRY_LABEL_FA,
        format_plate_display,
        public_vehicle_meta,
        vehicle_inquiry_bimebazar,
        vehicle_source_mode,
    )
except ImportError:  # pragma: no cover
    from vps.sanhab_vehicle_provider import (  # type: ignore
        SOURCE_BIMEBAZAR,
        SOURCE_LABEL_BIMEBAZAR,
        VEHICLE_INQUIRY_LABEL_FA,
        format_plate_display,
        public_vehicle_meta,
        vehicle_inquiry_bimebazar,
        vehicle_source_mode,
    )

getcontext().prec = 28

MODULE = "sanhab"
MODULE_LABEL = "سنهاب / بیمه مرکزی"
PRODUCT_LABEL = MODULE_LABEL

# Unique Sanhab code (کد یکتا) DEMO format: SNH-YYYYMMDD-XXXXXXXX (8 hex upper)
UNIQUE_CODE_RE = re.compile(r"^SNH-\d{8}-[A-F0-9]{8}$")
UNIQUE_CODE_PREFIX = "SNH"

# Export kinds
EXPORT_KINDS = ("issuance", "endorsement", "financial_tx")

# Default industry death-capital ceiling (rial) — DEMO configurable
DEFAULT_INDUSTRY_CEILING_RIAL = 50_000_000_000  # 50 میلیارد ریال DEMO

DEMO_DISCLAIMER = (
    "ماژول سنهاب: استعلام خودرو از طریق بیمه‌بازار (شرکا) — نه سنهاب رسمی بیمه مرکزی. "
    "تجمیع فوت / کد یکتا / صف ارسال همچنان DEMO stub. "
    "Excel HOLD · بدون wipe CRM · Eng-only این بچ."
)

ENG_EXTENSION_NOTE = (
    "Sanhab is Eng-module-only for this Excel batch (ENG_MODULE_HANDOFF §4). "
    "Future land shape: policy_number, computer_code, national_id, plate/VIN in "
    "case_365 / پرونده_365, Jalali TEXT. Do not invent locked insurance_type values."
)

HANDOFF_CITES = [
    "ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
    "MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
    "KARAFARIN_CORE_MODULES_BRIEF_20260924.md",
]

_STORE_LOCK = threading.RLock()
_CEILING_CONFIG: dict[str, Any] = {}
_DEATH_CAPS: dict[str, int] = {}  # national_id → known industry-wide death capital sum
_INQUIRIES: list[dict] = []
_UNIQUE_CODES: list[dict] = []  # keyed by policy_number (+ optional computer_code)
_EXPORT_QUEUE: list[dict] = []
_EXPORT_BATCHES: list[dict] = []
_NEXT_INQUIRY_ID = 1
_NEXT_CODE_ID = 1
_NEXT_QUEUE_ID = 1
_NEXT_BATCH_ID = 1
_SEEDED = False

# Where export bundles land (stub — no network)
_EXPORT_DIR = Path(
    os.environ.get("SANHAB_EXPORT_DIR")
    or "/workspace/fasihi-sms-urgent/.output/sanhab-exports"
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _dec(value: Any, default: Decimal | None = None) -> Decimal | None:
    if value is None:
        return default
    try:
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))
    except Exception:
        return default


def _as_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(Decimal(str(value)))
    except Exception:
        return default


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _qs_first(query: dict | None, *keys: str) -> Any:
    if not query:
        return None
    for k in keys:
        v = query.get(k)
        if isinstance(v, list):
            if v:
                return v[0]
        elif v is not None:
            return v
    return None


def _norm_nid(value: Any) -> str | None:
    s = _as_str(value)
    if not s:
        return None
    # keep leading zeros as text; strip spaces only
    return s.replace(" ", "").replace("-", "")


def ensure_seed() -> None:
    global _SEEDED, _CEILING_CONFIG, _DEATH_CAPS
    with _STORE_LOCK:
        if _SEEDED:
            return
        _CEILING_CONFIG = {
            "ceilingRial": DEFAULT_INDUSTRY_CEILING_RIAL,
            "currency": "IRR",
            "source": "DEMO_CONFIG",
            "updatedAt": iso_now(),
            "notes": "سقف تجمیع سرمایه فوت صنعت — قابل تنظیم DEMO",
            "demoStub": True,
        }
        # Seed a few known death capital sums for DEMO inquiries
        _DEATH_CAPS = {
            "0012345678": 12_000_000_000,
            "0076543210": 48_000_000_000,  # near ceiling
            "0099999999": 55_000_000_000,  # already over
        }
        _SEEDED = True


def reset_store_for_tests() -> None:
    global _SEEDED, _CEILING_CONFIG, _DEATH_CAPS
    global _INQUIRIES, _UNIQUE_CODES, _EXPORT_QUEUE, _EXPORT_BATCHES
    global _NEXT_INQUIRY_ID, _NEXT_CODE_ID, _NEXT_QUEUE_ID, _NEXT_BATCH_ID
    with _STORE_LOCK:
        _SEEDED = False
        _CEILING_CONFIG = {}
        _DEATH_CAPS = {}
        _INQUIRIES = []
        _UNIQUE_CODES = []
        _EXPORT_QUEUE = []
        _EXPORT_BATCHES = []
        _NEXT_INQUIRY_ID = 1
        _NEXT_CODE_ID = 1
        _NEXT_QUEUE_ID = 1
        _NEXT_BATCH_ID = 1
    ensure_seed()


# ---------------------------------------------------------------------------
# Pure helpers (testable without store)
# ---------------------------------------------------------------------------

def check_death_over_limit(
    known_sum_rial: int,
    proposed_capital_rial: int,
    ceiling_rial: int,
) -> dict:
    """Compare industry-wide death capital sum + proposed vs ceiling."""
    known = max(0, int(known_sum_rial or 0))
    proposed = max(0, int(proposed_capital_rial or 0))
    ceiling = max(0, int(ceiling_rial or 0))
    total = known + proposed
    over = total > ceiling
    headroom = max(0, ceiling - known)
    return {
        "knownSumRial": known,
        "proposedCapitalRial": proposed,
        "totalAfterRial": total,
        "ceilingRial": ceiling,
        "overLimit": over,
        "headroomRial": headroom,
        "excessRial": max(0, total - ceiling) if over else 0,
    }


def generate_unique_code(seed: str | None = None, when: datetime | None = None) -> str:
    """DEMO کد یکتا: SNH-YYYYMMDD-XXXXXXXX (8 hex). Deterministic if seed given."""
    dt = when or datetime.now(timezone.utc)
    ymd = dt.strftime("%Y%m%d")
    raw = (seed or f"{ymd}-{iso_now()}-{os.urandom(4).hex()}").encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()[:8].upper()
    return f"{UNIQUE_CODE_PREFIX}-{ymd}-{digest}"


def is_valid_unique_code(code: str | None) -> bool:
    if not code:
        return False
    return bool(UNIQUE_CODE_RE.match(str(code).strip()))


def stub_vehicle_inquiry(plate: str | None, vin: str | None) -> dict:
    """Deterministic DEMO stub from plate/VIN — no network."""
    key = f"{plate or ''}|{vin or ''}".upper()
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    # NCD % TP: 0–70 in steps of 5; Body: 0–60; accidents: 0–5
    tp = (int(h[0:2], 16) % 15) * 5  # 0..70
    body = (int(h[2:4], 16) % 13) * 5  # 0..60
    accidents = int(h[4:6], 16) % 6
    return {
        "plate": plate,
        "vin": vin,
        "thirdPartyNcdPct": tp,
        "bodyNcdPct": body,
        "accidentHistoryCount": accidents,
        "source": "DEMO_SANHAB_STUB",
        "demoStub": True,
    }


# ---------------------------------------------------------------------------
# Ceiling config
# ---------------------------------------------------------------------------

def get_death_ceiling() -> dict:
    ensure_seed()
    with _STORE_LOCK:
        cfg = copy.deepcopy(_CEILING_CONFIG)
    return {
        "ok": True,
        "config": cfg,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def put_death_ceiling(body: dict | None = None) -> dict:
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    ceiling = _as_int(
        body.get("ceilingRial")
        if body.get("ceilingRial") is not None
        else body.get("ceiling_rial")
    )
    if ceiling is None or ceiling < 0:
        return {"ok": False, "error": "ceilingRial نامعتبر (عدد ≥ 0 لازم است)"}
    notes = _as_str(body.get("notes"))
    with _STORE_LOCK:
        _CEILING_CONFIG["ceilingRial"] = ceiling
        _CEILING_CONFIG["updatedAt"] = iso_now()
        _CEILING_CONFIG["source"] = "DEMO_MANUAL_PUT"
        if notes:
            _CEILING_CONFIG["notes"] = notes
        cfg = copy.deepcopy(_CEILING_CONFIG)
    return {
        "ok": True,
        "config": cfg,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


# ---------------------------------------------------------------------------
# Death inquiry
# ---------------------------------------------------------------------------

def death_inquiry(body: dict | None = None) -> dict:
    """POST death inquiry: nationalId + optional proposedCapital / manualKnownSum."""
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    nid = _norm_nid(body.get("nationalId") or body.get("national_id"))
    if not nid:
        return {"ok": False, "error": "nationalId الزامی است"}

    proposed = _as_int(
        body.get("proposedCapital")
        if body.get("proposedCapital") is not None
        else body.get("proposed_capital")
        if body.get("proposed_capital") is not None
        else body.get("proposedCapitalRial"),
        default=0,
    ) or 0

    # Manual override of known industry sum (DEMO)
    manual = body.get("manualKnownSum")
    if manual is None:
        manual = body.get("manual_known_sum")
    if manual is None:
        manual = body.get("manualKnownSumRial")

    with _STORE_LOCK:
        ceiling = int(_CEILING_CONFIG.get("ceilingRial") or DEFAULT_INDUSTRY_CEILING_RIAL)
        if manual is not None:
            known = _as_int(manual, default=0) or 0
            override = True
            _DEATH_CAPS[nid] = known  # persist manual override in DEMO store
        else:
            known = int(_DEATH_CAPS.get(nid, 0))
            override = False

        check = check_death_over_limit(known, proposed, ceiling)
        global _NEXT_INQUIRY_ID
        inquiry = {
            "id": _NEXT_INQUIRY_ID,
            "kind": "death_sum",
            "nationalId": nid,
            "policyNumber": _as_str(body.get("policyNumber") or body.get("policy_number")),
            "computerCode": _as_str(body.get("computerCode") or body.get("computer_code")),
            "manualOverride": override,
            **check,
            "case365": {
                "کد ملی": nid,
                "تجمیع سرمایه فوت": check["knownSumRial"],
                "پیشنهاد سرمایه": check["proposedCapitalRial"],
            },
            "inquiryJalali": _as_str(body.get("inquiryJalali") or body.get("inquiry_jalali")),
            "createdAt": iso_now(),
            "demoStub": True,
        }
        _NEXT_INQUIRY_ID += 1
        _INQUIRIES.append(inquiry)
        out = copy.deepcopy(inquiry)

    return {
        "ok": True,
        "inquiry": out,
        "overLimit": out["overLimit"],
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
        "engNote": ENG_EXTENSION_NOTE,
    }


# ---------------------------------------------------------------------------
# Vehicle / plate / VIN inquiry + unique code
# ---------------------------------------------------------------------------

def vehicle_inquiry(body: dict | None = None) -> dict:
    """Vehicle inquiry — default live BimeBazar partners; DEMO stub only if toggled.

    Live inputs: full 4-part plate + national ID.
    Does NOT persist national ID / plate. Never silent-fallback to DEMO as live.
    Not official Central Insurance — source BIMEBAZAR_PARTNER.
    """
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    mode = vehicle_source_mode(body)

    if mode == "live":
        return vehicle_inquiry_bimebazar(body)

    # ---- Explicit DEMO stub path (tests / toggled) ----
    raw_plate = body.get("plate")
    if isinstance(raw_plate, dict):
        plate = format_plate_display(raw_plate)
    else:
        plate = _as_str(raw_plate or body.get("plateNumber") or body.get("plate_number"))
    vin = _as_str(body.get("vin") or body.get("VIN"))
    if not plate and not vin:
        return {
            "ok": False,
            "error": "plate یا vin الزامی است (حالت DEMO)",
            "code": "incomplete_input",
            "demoStub": True,
            "source": "DEMO_SANHAB_STUB",
            "lookupStatus": "incomplete_input",
        }

    policy_number = _as_str(body.get("policyNumber") or body.get("policy_number"))
    computer_code = _as_str(body.get("computerCode") or body.get("computer_code"))

    stub = stub_vehicle_inquiry(plate, vin)
    with _STORE_LOCK:
        global _NEXT_INQUIRY_ID
        inquiry = {
            "id": _NEXT_INQUIRY_ID,
            "kind": "vehicle",
            "plate": plate,
            "vin": vin,
            "policyNumber": policy_number,
            "computerCode": computer_code,
            "thirdPartyNcdPct": stub["thirdPartyNcdPct"],
            "bodyNcdPct": stub["bodyNcdPct"],
            "accidentHistoryCount": stub["accidentHistoryCount"],
            "case365": {
                "پلاک": plate,
                "VIN": vin,
                "تخفیف ثالث": stub["thirdPartyNcdPct"],
                "تخفیف بدنه": stub["bodyNcdPct"],
                "سابقه تصادف": stub["accidentHistoryCount"],
            },
            "createdAt": iso_now(),
            "demoStub": True,
            "source": "DEMO_SANHAB_STUB",
        }
        _NEXT_INQUIRY_ID += 1
        # DEMO path may keep local stub history; live path never stores PII.
        _INQUIRIES.append(inquiry)
        out = copy.deepcopy(inquiry)

    return {
        "ok": True,
        "inquiry": out,
        "demoStub": True,
        "source": "DEMO_SANHAB_STUB",
        "sourceLabel": "DEMO",
        "label": "استعلام DEMO (stub)",
        "lookupStatus": "demo",
        "userMessage": "نتیجه DEMO — داده زنده نیست",
        "disclaimer": DEMO_DISCLAIMER,
        "engNote": ENG_EXTENSION_NOTE,
        "persistedPii": False,
    }


def assign_unique_code(body: dict | None = None) -> dict:
    """POST assign stub کد یکتا onto auto policy record (by policy_number / computer_code)."""
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    policy_number = _as_str(body.get("policyNumber") or body.get("policy_number"))
    if not policy_number:
        return {"ok": False, "error": "policyNumber الزامی است"}
    computer_code = _as_str(body.get("computerCode") or body.get("computer_code"))
    plate = _as_str(body.get("plate"))
    vin = _as_str(body.get("vin"))
    force = bool(body.get("force") or body.get("reassign"))

    with _STORE_LOCK:
        existing = None
        for row in _UNIQUE_CODES:
            if row["policyNumber"] == policy_number:
                if computer_code is None or row.get("computerCode") == computer_code:
                    existing = row
                    break
        if existing and not force:
            return {
                "ok": True,
                "assigned": False,
                "uniqueCode": existing["uniqueCode"],
                "record": copy.deepcopy(existing),
                "message": "کد یکتا قبلاً تخصیص یافته",
                "demoStub": True,
            }

        seed = f"{policy_number}|{computer_code or ''}|{plate or ''}|{vin or ''}"
        code = generate_unique_code(seed=seed)
        assert is_valid_unique_code(code)

        global _NEXT_CODE_ID
        if existing and force:
            existing["uniqueCode"] = code
            existing["updatedAt"] = iso_now()
            existing["plate"] = plate or existing.get("plate")
            existing["vin"] = vin or existing.get("vin")
            record = copy.deepcopy(existing)
        else:
            record = {
                "id": _NEXT_CODE_ID,
                "uniqueCode": code,
                "policyNumber": policy_number,
                "computerCode": computer_code,
                "plate": plate,
                "vin": vin,
                "insuranceTypeHint": None,  # do NOT invent locked enum values
                "case365": {
                    "شماره بیمه نامه": policy_number,
                    "کد رایانه": computer_code,
                    "کد یکتا": code,
                    "پلاک": plate,
                    "VIN": vin,
                },
                "assignedAt": iso_now(),
                "updatedAt": iso_now(),
                "demoStub": True,
                "source": "DEMO_SANHAB_STUB",
            }
            _NEXT_CODE_ID += 1
            _UNIQUE_CODES.append(record)
            record = copy.deepcopy(record)

    return {
        "ok": True,
        "assigned": True,
        "uniqueCode": record["uniqueCode"],
        "record": record,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
        "engNote": ENG_EXTENSION_NOTE,
    }


def get_unique_code(query: dict | None = None) -> dict:
    ensure_seed()
    q = query or {}
    policy_number = _as_str(_qs_first(q, "policyNumber", "policy_number"))
    if not policy_number:
        return {"ok": False, "error": "policyNumber query الزامی است"}
    computer_code = _as_str(_qs_first(q, "computerCode", "computer_code"))
    with _STORE_LOCK:
        for row in _UNIQUE_CODES:
            if row["policyNumber"] != policy_number:
                continue
            if computer_code is not None and row.get("computerCode") != computer_code:
                continue
            return {
                "ok": True,
                "found": True,
                "uniqueCode": row["uniqueCode"],
                "record": copy.deepcopy(row),
                "demoStub": True,
            }
    return {
        "ok": True,
        "found": False,
        "uniqueCode": None,
        "record": None,
        "demoStub": True,
    }


# ---------------------------------------------------------------------------
# Export queue
# ---------------------------------------------------------------------------

def enqueue_export(body: dict | None = None) -> dict:
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    kind = _as_str(body.get("kind") or body.get("type"))
    if not kind or kind not in EXPORT_KINDS:
        return {
            "ok": False,
            "error": f"kind نامعتبر — مجاز: {', '.join(EXPORT_KINDS)}",
        }
    payload = body.get("payload")
    if payload is None:
        payload = {k: v for k, v in body.items() if k not in ("kind", "type", "payload")}
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload باید آبجکت باشد"}

    with _STORE_LOCK:
        global _NEXT_QUEUE_ID
        item = {
            "id": _NEXT_QUEUE_ID,
            "kind": kind,
            "payload": copy.deepcopy(payload),
            "policyNumber": _as_str(payload.get("policyNumber") or payload.get("policy_number")),
            "computerCode": _as_str(payload.get("computerCode") or payload.get("computer_code")),
            "status": "queued",
            "batchId": None,
            "enqueuedAt": iso_now(),
            "exportedAt": None,
            "demoStub": True,
        }
        _NEXT_QUEUE_ID += 1
        _EXPORT_QUEUE.append(item)
        out = copy.deepcopy(item)
    return {"ok": True, "item": out, "demoStub": True, "disclaimer": DEMO_DISCLAIMER}


def list_export_queue(query: dict | None = None) -> dict:
    ensure_seed()
    status = _as_str(_qs_first(query or {}, "status"))
    with _STORE_LOCK:
        items = list(_EXPORT_QUEUE)
        if status:
            items = [i for i in items if i.get("status") == status]
        return {
            "ok": True,
            "items": copy.deepcopy(items),
            "count": len(items),
            "queuedCount": sum(1 for i in _EXPORT_QUEUE if i.get("status") == "queued"),
            "demoStub": True,
        }


def run_export(body: dict | None = None) -> dict:
    """Build JSON+CSV stub bundle for queued items; mark exported. No network."""
    ensure_seed()
    body = body if isinstance(body, dict) else {}
    only_ids = body.get("ids")
    if only_ids is not None and not isinstance(only_ids, list):
        return {"ok": False, "error": "ids باید آرایه باشد"}

    with _STORE_LOCK:
        pending = [
            i
            for i in _EXPORT_QUEUE
            if i.get("status") == "queued"
            and (only_ids is None or i["id"] in only_ids)
        ]
        if not pending:
            return {
                "ok": True,
                "exported": 0,
                "batch": None,
                "message": "صف خالی است",
                "demoStub": True,
            }

        global _NEXT_BATCH_ID
        batch_id = _NEXT_BATCH_ID
        _NEXT_BATCH_ID += 1
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        batch_code = f"SNH-EXP-{stamp}-{batch_id:04d}"

        _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        json_path = _EXPORT_DIR / f"{batch_code}.json"
        csv_path = _EXPORT_DIR / f"{batch_code}.csv"

        rows = []
        for item in pending:
            rows.append(
                {
                    "queueId": item["id"],
                    "kind": item["kind"],
                    "policyNumber": item.get("policyNumber"),
                    "computerCode": item.get("computerCode"),
                    "payload": item["payload"],
                    "enqueuedAt": item.get("enqueuedAt"),
                }
            )
            item["status"] = "exported"
            item["batchId"] = batch_id
            item["exportedAt"] = iso_now()

        bundle = {
            "batchCode": batch_code,
            "batchId": batch_id,
            "createdAt": iso_now(),
            "count": len(rows),
            "items": rows,
            "compliance": "Central Insurance periodic tx/endorsement stub — NO network",
            "demoStub": True,
            "handoffCites": HANDOFF_CITES,
        }
        json_path.write_text(
            json.dumps(bundle, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        buf = io.StringIO()
        writer = csv.DictWriter(
            buf,
            fieldnames=["queueId", "kind", "policyNumber", "computerCode", "enqueuedAt", "payloadJson"],
        )
        writer.writeheader()
        for r in rows:
            writer.writerow(
                {
                    "queueId": r["queueId"],
                    "kind": r["kind"],
                    "policyNumber": r.get("policyNumber") or "",
                    "computerCode": r.get("computerCode") or "",
                    "enqueuedAt": r.get("enqueuedAt") or "",
                    "payloadJson": json.dumps(r["payload"], ensure_ascii=False),
                }
            )
        csv_path.write_text(buf.getvalue(), encoding="utf-8-sig")

        batch = {
            "id": batch_id,
            "batchCode": batch_code,
            "itemCount": len(rows),
            "jsonPath": str(json_path),
            "csvPath": str(csv_path),
            "status": "exported",
            "createdAt": iso_now(),
            "demoStub": True,
            "networkCall": False,
        }
        _EXPORT_BATCHES.append(batch)
        out = copy.deepcopy(batch)

    return {
        "ok": True,
        "exported": out["itemCount"],
        "batch": out,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def meta() -> dict:
    ensure_seed()
    with _STORE_LOCK:
        return {
            "ok": True,
            "module": MODULE,
            "label": MODULE_LABEL,
            "productLabel": PRODUCT_LABEL,
            "demoStub": True,  # death/unique-code/export remain DEMO
            "disclaimer": DEMO_DISCLAIMER,
            "engNote": ENG_EXTENSION_NOTE,
            "handoffCites": HANDOFF_CITES,
            "uniqueCodeFormat": "SNH-YYYYMMDD-XXXXXXXX",
            "uniqueCodeRegex": UNIQUE_CODE_RE.pattern,
            "exportKinds": list(EXPORT_KINDS),
            "ceilingRial": _CEILING_CONFIG.get("ceilingRial"),
            "vehicleInquiry": public_vehicle_meta(),
            "counts": {
                "inquiries": len(_INQUIRIES),
                "uniqueCodes": len(_UNIQUE_CODES),
                "exportQueued": sum(1 for i in _EXPORT_QUEUE if i.get("status") == "queued"),
                "exportBatches": len(_EXPORT_BATCHES),
            },
            "endpoints": [
                "GET /api/sanhab/meta",
                "GET|PUT /api/sanhab/death-ceiling",
                "POST /api/sanhab/death-inquiry",
                "POST /api/sanhab/vehicle-inquiry",
                "POST /api/sanhab/unique-code",
                "GET /api/sanhab/unique-code?policyNumber=",
                "POST /api/sanhab/export-queue",
                "GET /api/sanhab/export-queue",
                "POST /api/sanhab/export/run",
            ],
            # Vehicle live may call BimeBazar; other M5 paths stay no-network DEMO.
            "noNetwork": vehicle_source_mode({}) == "demo",
        }


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
) -> tuple[int, dict]:
    """Route sanhab API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/sanhab/meta" and method == "GET":
        return 200, meta()

    if path == "/api/sanhab/death-ceiling":
        if method == "GET":
            return 200, get_death_ceiling()
        if method in ("PUT", "POST"):
            result = put_death_ceiling(body)
            return (200 if result.get("ok") else 400), result

    if path == "/api/sanhab/death-inquiry" and method == "POST":
        result = death_inquiry(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/sanhab/vehicle-inquiry" and method == "POST":
        result = vehicle_inquiry(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/sanhab/unique-code":
        if method == "POST":
            result = assign_unique_code(body)
            return (200 if result.get("ok") else 400), result
        if method == "GET":
            result = get_unique_code(query)
            return (200 if result.get("ok") else 400), result

    if path == "/api/sanhab/export-queue":
        if method == "POST":
            result = enqueue_export(body)
            return (200 if result.get("ok") else 400), result
        if method == "GET":
            return 200, list_export_queue(query)

    if path == "/api/sanhab/export/run" and method == "POST":
        result = run_export(body)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
