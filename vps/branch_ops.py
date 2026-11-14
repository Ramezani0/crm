"""M8 Branch Operations — کارتابل شعب / عملیات نمایندگی (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 009.
NEVER touches / wipes customers/policies/installments/M1–M7 tables.

Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
Cite:
  ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
  MODULE_FORMULA_IMPORT_LOCKS_20260924.md
  KARAFARIN_CORE_MODULES_BRIEF_20260924.md §8
  research insurance-crm-modules-gemini-20260924.txt (~3702–3707, 4421–4424)

Features (DEMO stubs):
  1) Security paper inventory: printed receipts, physical policy sheets, holograms
     lifecycle: received_from_branch → assigned_to_issue → issued | voided
  2) Commission/finance variance: agency ledger vs branch kartabl amounts
  3) Incoming policyholder checks (چک) stub
"""
from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone
from typing import Any

MODULE = "branch_ops"
MODULE_LABEL = "عملیات شعبه"
PRODUCT_LABEL = "کارتابل شعب / عملیات نمایندگی"

PAPER_KINDS = ("receipt", "policy_sheet", "hologram")
PAPER_KIND_LABELS = {
    "receipt": "قبض چاپی",
    "policy_sheet": "برگه بیمه‌نامه",
    "hologram": "هولوگرام",
}
PAPER_STATUSES = (
    "received_from_branch",
    "assigned_to_issue",
    "issued",
    "voided",
)

CHECK_STATUSES = ("received", "deposited", "cleared", "bounced", "cancelled")

DEMO_DISCLAIMER = (
    "DEMO — اسکلت کارتابل شعب؛ موجودی اوراق/هولوگرام، مغایرت کارمزد، چک بیمه‌گذار. "
    "Excel HOLD · بدون wipe CRM · Eng-only این بچ."
)

ENG_EXTENSION_NOTE = (
    "Branch ops is Eng-module-only for this Excel batch "
    "(MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch = none in Excel). "
    "Serial numbers DEMO. No real hologram/printer integration."
)

HANDOFF_CITES = [
    "ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
    "MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
    "KARAFARIN_CORE_MODULES_BRIEF_20260924.md",
]

DEFAULT_BRANCH = "BR-TEH-01"
DEFAULT_AGENCY = "3045"

_STORE_LOCK = threading.RLock()
_STOCK: list[dict] = []  # one row per serial
_MOVEMENTS: list[dict] = []
_VARIANCES: list[dict] = []
_CHECKS: list[dict] = []
_NEXT_MOVEMENT_ID = 1
_NEXT_VARIANCE_ID = 1
_NEXT_CHECK_ID = 1
_SEEDED = False


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


def parse_serial_int(s: str) -> int | None:
    """Parse trailing digits from a DEMO serial like REC-1001 or plain 1001."""
    raw = str(s or "").strip()
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def expand_serial_range(
    kind: str,
    serial_from: str,
    serial_to: str,
) -> list[str] | dict:
    """Expand inclusive serial range. Returns list of serial strings or error dict."""
    kind = str(kind or "").strip()
    if kind not in PAPER_KINDS:
        return {"error": f"kind نامعتبر؛ مجاز: {', '.join(PAPER_KINDS)}"}
    a = parse_serial_int(serial_from)
    b = parse_serial_int(serial_to)
    if a is None or b is None:
        return {"error": "serialFrom/serialTo باید شامل رقم باشند"}
    if b < a:
        return {"error": "serialTo باید ≥ serialFrom باشد"}
    if b - a > 500:
        return {"error": "بازه سریال حداکثر ۵۰۰ عدد (DEMO)"}
    prefix_map = {
        "receipt": "REC-",
        "policy_sheet": "POL-",
        "hologram": "HOLO-",
    }
    # Preserve caller prefix if present on serialFrom, else DEMO prefix
    sf = str(serial_from).strip()
    prefix = prefix_map[kind]
    if "-" in sf:
        # keep text before last digit run
        i = 0
        while i < len(sf) and not sf[i].isdigit():
            i += 1
        if i > 0:
            prefix = sf[:i]
    width = max(len("".join(ch for ch in str(serial_from) if ch.isdigit())), 4)
    return [f"{prefix}{str(n).zfill(width)}" for n in range(a, b + 1)]


def calc_variance(agency_amount: int | float, branch_amount: int | float) -> dict[str, Any]:
    """agency − branch. Positive = agency higher than branch kartabl."""
    try:
        a = int(agency_amount)
        b = int(branch_amount)
    except (TypeError, ValueError):
        return {"ok": False, "error": "مبالغ باید عدد صحیح (ریال) باشند"}
    diff = a - b
    return {
        "ok": True,
        "agencyAmount": a,
        "branchAmount": b,
        "variance": diff,
        "absVariance": abs(diff),
        "direction": "agency_higher" if diff > 0 else ("branch_higher" if diff < 0 else "matched"),
    }


def reset_store_for_tests() -> None:
    global _NEXT_MOVEMENT_ID, _NEXT_VARIANCE_ID, _NEXT_CHECK_ID, _SEEDED
    with _STORE_LOCK:
        _STOCK.clear()
        _MOVEMENTS.clear()
        _VARIANCES.clear()
        _CHECKS.clear()
        _NEXT_MOVEMENT_ID = 1
        _NEXT_VARIANCE_ID = 1
        _NEXT_CHECK_ID = 1
        _SEEDED = False
    ensure_seed()


def ensure_seed() -> None:
    global _SEEDED, _NEXT_MOVEMENT_ID, _NEXT_VARIANCE_ID, _NEXT_CHECK_ID
    with _STORE_LOCK:
        if _SEEDED:
            return
        # Seed a small stock batch
        seed_serials = [
            ("receipt", "REC-1001", "received_from_branch"),
            ("receipt", "REC-1002", "received_from_branch"),
            ("policy_sheet", "POL-2001", "assigned_to_issue"),
            ("hologram", "HOLO-3001", "received_from_branch"),
            ("hologram", "HOLO-3002", "issued"),
        ]
        for kind, serial, status in seed_serials:
            row = {
                "serial": serial,
                "kind": kind,
                "kindLabel": PAPER_KIND_LABELS[kind],
                "status": status,
                "branchCode": DEFAULT_BRANCH,
                "agencyCode": DEFAULT_AGENCY,
                "policyNumber": "DEMO-1404-001" if status == "issued" else None,
                "voidReason": None,
                "demoStub": True,
                "receivedAt": iso_now(),
                "updatedAt": iso_now(),
            }
            _STOCK.append(row)
            _MOVEMENTS.append(
                {
                    "id": _NEXT_MOVEMENT_ID,
                    "serial": serial,
                    "kind": kind,
                    "action": "receive" if status == "received_from_branch" else status,
                    "fromStatus": None,
                    "toStatus": status,
                    "policyNumber": row["policyNumber"],
                    "reason": None,
                    "branchCode": DEFAULT_BRANCH,
                    "demoStub": True,
                    "createdAt": iso_now(),
                }
            )
            _NEXT_MOVEMENT_ID += 1

        # Seed one variance
        calc = calc_variance(12_500_000, 12_200_000)
        _VARIANCES.append(
            {
                "id": _NEXT_VARIANCE_ID,
                "agentCode": "3045",
                "agencyAmount": calc["agencyAmount"],
                "branchAmount": calc["branchAmount"],
                "variance": calc["variance"],
                "direction": calc["direction"],
                "note": "مغایرت DEMO کارمزد وصولی فصل",
                "periodJalali": "1404/06",
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        _NEXT_VARIANCE_ID += 1

        # Seed one check
        _CHECKS.append(
            {
                "id": _NEXT_CHECK_ID,
                "checkNumber": "CHK-DEMO-7788",
                "amountRial": 5_000_000,
                "bankName": "بانک کارآفرین",
                "policyholderCode": "100200",
                "policyNumber": None,
                "dueJalali": "1404/07/15",
                "status": "received",
                "note": "چک DEMO بیمه‌گذار",
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        _NEXT_CHECK_ID += 1
        _SEEDED = True


def _find_stock(serial: str) -> dict | None:
    s = str(serial).strip()
    return next((r for r in _STOCK if r["serial"] == s), None)


def list_stock(query: dict | None = None) -> dict:
    ensure_seed()
    kind = _qget(query, "kind")
    status = _qget(query, "status")
    branch = _qget(query, "branchCode") or _qget(query, "branch_code")
    with _STORE_LOCK:
        rows = [copy.deepcopy(r) for r in _STOCK]
    if kind:
        rows = [r for r in rows if r["kind"] == kind]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if branch:
        rows = [r for r in rows if r.get("branchCode") == branch]
    rows.sort(key=lambda x: (x.get("kind") or "", x.get("serial") or ""))
    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
    return {
        "ok": True,
        "count": len(rows),
        "items": rows,
        "byStatus": by_status,
        "byKind": by_kind,
        "kinds": list(PAPER_KINDS),
        "kindLabels": copy.deepcopy(PAPER_KIND_LABELS),
        "statuses": list(PAPER_STATUSES),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def receive_stock(body: dict) -> dict:
    ensure_seed()
    kind = str(body.get("kind") or "").strip()
    serial_from = str(body.get("serialFrom") or body.get("serial_from") or "").strip()
    serial_to = str(body.get("serialTo") or body.get("serial_to") or serial_from).strip()
    branch = str(
        body.get("branchCode") or body.get("branch_code") or DEFAULT_BRANCH
    ).strip() or DEFAULT_BRANCH
    agency = str(
        body.get("agencyCode") or body.get("agency_code") or DEFAULT_AGENCY
    ).strip() or DEFAULT_AGENCY

    expanded = expand_serial_range(kind, serial_from, serial_to)
    if isinstance(expanded, dict):
        return {"ok": False, **expanded}

    created: list[dict] = []
    skipped: list[str] = []
    with _STORE_LOCK:
        global _NEXT_MOVEMENT_ID
        for serial in expanded:
            existing = _find_stock(serial)
            if existing:
                skipped.append(serial)
                continue
            row = {
                "serial": serial,
                "kind": kind,
                "kindLabel": PAPER_KIND_LABELS[kind],
                "status": "received_from_branch",
                "branchCode": branch,
                "agencyCode": agency,
                "policyNumber": None,
                "voidReason": None,
                "demoStub": True,
                "receivedAt": iso_now(),
                "updatedAt": iso_now(),
            }
            _STOCK.append(row)
            _MOVEMENTS.append(
                {
                    "id": _NEXT_MOVEMENT_ID,
                    "serial": serial,
                    "kind": kind,
                    "action": "receive",
                    "fromStatus": None,
                    "toStatus": "received_from_branch",
                    "policyNumber": None,
                    "reason": None,
                    "branchCode": branch,
                    "demoStub": True,
                    "createdAt": iso_now(),
                }
            )
            _NEXT_MOVEMENT_ID += 1
            created.append(copy.deepcopy(row))

    return {
        "ok": True,
        "received": len(created),
        "skipped": skipped,
        "items": created,
        "kind": kind,
        "branchCode": branch,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def issue_stock(body: dict) -> dict:
    ensure_seed()
    serial = str(body.get("serial") or "").strip()
    if not serial:
        return {"ok": False, "error": "serial الزامی است"}
    policy_number = body.get("policyNumber") or body.get("policy_number")
    policy_number = str(policy_number).strip() if policy_number else None

    with _STORE_LOCK:
        global _NEXT_MOVEMENT_ID
        row = _find_stock(serial)
        if not row:
            return {"ok": False, "error": f"سریال {serial} یافت نشد"}
        if row["status"] == "voided":
            return {"ok": False, "error": "اوراق ابطال‌شده قابل صدور نیست"}
        if row["status"] == "issued":
            return {
                "ok": True,
                "issued": False,
                "item": copy.deepcopy(row),
                "note": "قبلاً صادر شده",
                "demoStub": True,
            }
        from_status = row["status"]
        # Lifecycle: received → assigned → issued (allow jump from received)
        if from_status == "received_from_branch":
            row["status"] = "assigned_to_issue"
            _MOVEMENTS.append(
                {
                    "id": _NEXT_MOVEMENT_ID,
                    "serial": serial,
                    "kind": row["kind"],
                    "action": "assign",
                    "fromStatus": from_status,
                    "toStatus": "assigned_to_issue",
                    "policyNumber": policy_number,
                    "reason": None,
                    "branchCode": row.get("branchCode"),
                    "demoStub": True,
                    "createdAt": iso_now(),
                }
            )
            _NEXT_MOVEMENT_ID += 1
            from_status = "assigned_to_issue"

        row["status"] = "issued"
        row["policyNumber"] = policy_number
        row["updatedAt"] = iso_now()
        _MOVEMENTS.append(
            {
                "id": _NEXT_MOVEMENT_ID,
                "serial": serial,
                "kind": row["kind"],
                "action": "issue",
                "fromStatus": from_status,
                "toStatus": "issued",
                "policyNumber": policy_number,
                "reason": None,
                "branchCode": row.get("branchCode"),
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        _NEXT_MOVEMENT_ID += 1
        out = copy.deepcopy(row)

    return {
        "ok": True,
        "issued": True,
        "item": out,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def void_stock(body: dict) -> dict:
    ensure_seed()
    serial = str(body.get("serial") or "").strip()
    reason = str(body.get("reason") or "").strip()
    if not serial:
        return {"ok": False, "error": "serial الزامی است"}
    if not reason:
        return {"ok": False, "error": "reason الزامی است"}

    with _STORE_LOCK:
        global _NEXT_MOVEMENT_ID
        row = _find_stock(serial)
        if not row:
            return {"ok": False, "error": f"سریال {serial} یافت نشد"}
        if row["status"] == "voided":
            return {
                "ok": True,
                "voided": False,
                "item": copy.deepcopy(row),
                "note": "قبلاً ابطال شده",
                "demoStub": True,
            }
        from_status = row["status"]
        row["status"] = "voided"
        row["voidReason"] = reason
        row["updatedAt"] = iso_now()
        _MOVEMENTS.append(
            {
                "id": _NEXT_MOVEMENT_ID,
                "serial": serial,
                "kind": row["kind"],
                "action": "void",
                "fromStatus": from_status,
                "toStatus": "voided",
                "policyNumber": row.get("policyNumber"),
                "reason": reason,
                "branchCode": row.get("branchCode"),
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        _NEXT_MOVEMENT_ID += 1
        out = copy.deepcopy(row)

    return {
        "ok": True,
        "voided": True,
        "item": out,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def list_variances(query: dict | None = None) -> dict:
    ensure_seed()
    agent = _qget(query, "agentCode") or _qget(query, "agent_code")
    with _STORE_LOCK:
        rows = [copy.deepcopy(r) for r in _VARIANCES]
    if agent:
        rows = [r for r in rows if str(r.get("agentCode")) == agent]
    rows.sort(key=lambda x: x.get("id", 0), reverse=True)
    total_abs = sum(int(r.get("absVariance") or abs(int(r.get("variance") or 0))) for r in rows)
    return {
        "ok": True,
        "count": len(rows),
        "items": rows,
        "totalAbsVariance": total_abs,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def create_variance(body: dict) -> dict:
    ensure_seed()
    agent = str(body.get("agentCode") or body.get("agent_code") or "").strip()
    if not agent:
        return {"ok": False, "error": "agentCode الزامی است"}
    calc = calc_variance(
        body.get("agencyAmount") if "agencyAmount" in body else body.get("agency_amount"),
        body.get("branchAmount") if "branchAmount" in body else body.get("branch_amount"),
    )
    if not calc.get("ok"):
        return calc
    note = body.get("note")
    period = body.get("periodJalali") or body.get("period_jalali")

    with _STORE_LOCK:
        global _NEXT_VARIANCE_ID
        row = {
            "id": _NEXT_VARIANCE_ID,
            "agentCode": agent,
            "agencyAmount": calc["agencyAmount"],
            "branchAmount": calc["branchAmount"],
            "variance": calc["variance"],
            "absVariance": calc["absVariance"],
            "direction": calc["direction"],
            "note": str(note).strip() if note else None,
            "periodJalali": str(period).strip() if period else None,
            "demoStub": True,
            "createdAt": iso_now(),
        }
        _VARIANCES.append(row)
        _NEXT_VARIANCE_ID += 1
        out = copy.deepcopy(row)

    return {
        "ok": True,
        "created": True,
        "item": out,
        "calc": calc,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def list_checks(query: dict | None = None) -> dict:
    ensure_seed()
    status = _qget(query, "status")
    ph = _qget(query, "policyholderCode") or _qget(query, "policyholder_code")
    with _STORE_LOCK:
        rows = [copy.deepcopy(r) for r in _CHECKS]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    if ph:
        rows = [r for r in rows if str(r.get("policyholderCode")) == ph]
    rows.sort(key=lambda x: x.get("id", 0), reverse=True)
    return {
        "ok": True,
        "count": len(rows),
        "items": rows,
        "statuses": list(CHECK_STATUSES),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def create_check(body: dict) -> dict:
    ensure_seed()
    check_number = str(
        body.get("checkNumber") or body.get("check_number") or ""
    ).strip()
    if not check_number:
        return {"ok": False, "error": "checkNumber الزامی است"}
    try:
        amount = int(body.get("amountRial") if "amountRial" in body else body.get("amount_rial"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "amountRial باید عدد صحیح باشد"}
    if amount <= 0:
        return {"ok": False, "error": "amountRial باید مثبت باشد"}

    status = str(body.get("status") or "received").strip() or "received"
    if status not in CHECK_STATUSES:
        return {"ok": False, "error": f"status نامعتبر؛ مجاز: {', '.join(CHECK_STATUSES)}"}

    ph = body.get("policyholderCode") or body.get("policyholder_code")
    policy_number = body.get("policyNumber") or body.get("policy_number")
    bank = body.get("bankName") or body.get("bank_name")
    due = body.get("dueJalali") or body.get("due_jalali")
    note = body.get("note")

    with _STORE_LOCK:
        global _NEXT_CHECK_ID
        # Idempotent-ish by checkNumber
        existing = next(
            (c for c in _CHECKS if c["checkNumber"] == check_number),
            None,
        )
        if existing:
            return {
                "ok": True,
                "created": False,
                "item": copy.deepcopy(existing),
                "note": "چک قبلی بازگردانی شد",
                "demoStub": True,
            }
        row = {
            "id": _NEXT_CHECK_ID,
            "checkNumber": check_number,
            "amountRial": amount,
            "bankName": str(bank).strip() if bank else None,
            "policyholderCode": str(ph).strip() if ph else None,
            "policyNumber": str(policy_number).strip() if policy_number else None,
            "dueJalali": str(due).strip() if due else None,
            "status": status,
            "note": str(note).strip() if note else None,
            "demoStub": True,
            "createdAt": iso_now(),
        }
        _CHECKS.append(row)
        _NEXT_CHECK_ID += 1
        out = copy.deepcopy(row)

    return {
        "ok": True,
        "created": True,
        "item": out,
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
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
            "engNote": ENG_EXTENSION_NOTE,
            "handoffCites": HANDOFF_CITES,
            "paperKinds": list(PAPER_KINDS),
            "kindLabels": copy.deepcopy(PAPER_KIND_LABELS),
            "paperStatuses": list(PAPER_STATUSES),
            "checkStatuses": list(CHECK_STATUSES),
            "defaultBranch": DEFAULT_BRANCH,
            "defaultAgency": DEFAULT_AGENCY,
            "counts": {
                "stock": len(_STOCK),
                "movements": len(_MOVEMENTS),
                "variances": len(_VARIANCES),
                "checks": len(_CHECKS),
            },
            "endpoints": [
                "GET /api/branch-ops/meta",
                "GET /api/branch-ops/stock",
                "POST /api/branch-ops/stock/receive",
                "POST /api/branch-ops/stock/issue",
                "POST /api/branch-ops/stock/void",
                "GET /api/branch-ops/variances",
                "POST /api/branch-ops/variances",
                "GET /api/branch-ops/checks",
                "POST /api/branch-ops/checks",
            ],
        }


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
) -> tuple[int, dict]:
    """Route branch-ops API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/branch-ops/meta" and method == "GET":
        return 200, meta()

    if path == "/api/branch-ops/stock" and method == "GET":
        return 200, list_stock(query)

    if path == "/api/branch-ops/stock/receive" and method == "POST":
        result = receive_stock(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/branch-ops/stock/issue" and method == "POST":
        result = issue_stock(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/branch-ops/stock/void" and method == "POST":
        result = void_stock(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/branch-ops/variances" and method == "GET":
        return 200, list_variances(query)

    if path == "/api/branch-ops/variances" and method == "POST":
        result = create_variance(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/branch-ops/checks" and method == "GET":
        return 200, list_checks(query)

    if path == "/api/branch-ops/checks" and method == "POST":
        result = create_check(body)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
