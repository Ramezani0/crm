"""M4 درمان گروهی و معرفی‌نامه — Group Health & E-Referral (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 005.
NEVER touches / wipes customers/policies/installments/sales_network/sima_zar/omid_pension.

Eng-only: no group-health Excel in n1–n21.
product_code = 'group_health' (Eng-extension pending Import map enum update).
Do NOT invent insurance_type outside locked handoff enum — store on module tables;
policies.insurance_type left nullable/untouched. Cite:
  ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
  MODULE_FORMULA_IMPORT_LOCKS_20260924.md

ClaimPayout (DEMO):
  min((ApprovedTariff - BasicInsurerShare) * (1 - DeductibleRate), RemainingSublimit)
"""
from __future__ import annotations

import copy
import csv
import io
import json
import threading
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import Any

getcontext().prec = 28

PRODUCT = "group_health"
PRODUCT_LABEL = "درمان گروهی"
PRODUCT_CODE = "group_health"  # Eng-extension — NOT in locked insurance_type enum yet
# insurance_type omitted from locked enum; documented pending Import map update
ENG_EXTENSION_NOTE = (
    "product_code=group_health is an Eng-extension. Import locked insurance_type enum "
    "(ENG_MODULE_HANDOFF §2) has no group_health yet — do not pollute policies.insurance_type "
    "until Import map adds it. Future land shape: policy_number, national_id, "
    "policyholder_code, case_365, Jalali TEXT."
)

CATEGORIES = ("hospital", "paraclinic", "dental", "maternity")
REFERRAL_TYPES = ("hospital", "paraclinic")
CLAIM_KINDS = ("outpatient", "dental")
WAITING_BENEFITS = ("maternity", "surgery")

DEFAULT_FRANCHISE_PCT = Decimal("10")  # 10% DEMO
DEFAULT_CEILINGS = {
    "hospital": 200_000_000,
    "paraclinic": 40_000_000,
    "dental": 15_000_000,
    "maternity": 80_000_000,
}

DEMO_DISCLAIMER = (
    "DEMO — اسکلت درمان گروهی؛ تعرفه کالیفرنیا/ارزش نسبی stub؛ "
    "ClaimPayout=min((ApprovedTariff−BasicShare)×(1−Franchise),RemainingCeiling). "
    "Excel HOLD · بدون wipe CRM."
)

_STORE_LOCK = threading.RLock()
_CONTRACTS: list[dict] = []
_MEMBERS: list[dict] = []
_CEILINGS: list[dict] = []
_REFERRALS: list[dict] = []
_CLAIMS: list[dict] = []
_TARIFF: list[dict] = []
_AMENDMENTS: list[dict] = []
_WAITING: list[dict] = []
_NEXT_CONTRACT_ID = 1
_NEXT_MEMBER_ID = 1
_NEXT_CEILING_ID = 1
_NEXT_REFERRAL_ID = 1
_NEXT_CLAIM_ID = 1
_NEXT_AMEND_ID = 1
_SEEDED = False


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


def _q_rial(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _as_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(Decimal(str(value)))
    except Exception:
        return default


def reset_store_for_tests() -> None:
    global _CONTRACTS, _MEMBERS, _CEILINGS, _REFERRALS, _CLAIMS, _TARIFF
    global _AMENDMENTS, _WAITING
    global _NEXT_CONTRACT_ID, _NEXT_MEMBER_ID, _NEXT_CEILING_ID
    global _NEXT_REFERRAL_ID, _NEXT_CLAIM_ID, _NEXT_AMEND_ID, _SEEDED
    with _STORE_LOCK:
        _CONTRACTS = []
        _MEMBERS = []
        _CEILINGS = []
        _REFERRALS = []
        _CLAIMS = []
        _TARIFF = []
        _AMENDMENTS = []
        _WAITING = []
        _NEXT_CONTRACT_ID = 1
        _NEXT_MEMBER_ID = 1
        _NEXT_CEILING_ID = 1
        _NEXT_REFERRAL_ID = 1
        _NEXT_CLAIM_ID = 1
        _NEXT_AMEND_ID = 1
        _SEEDED = False


def _seed_tariff() -> None:
    global _TARIFF
    if _TARIFF:
        return
    _TARIFF = [
        {
            "serviceCode": "GH-H-100",
            "titleFa": "بستری اتاق عمل عمومی",
            "category": "hospital",
            "approvedRial": 45_000_000,
            "relativeValue": 12.5,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-P-210",
            "titleFa": "ام‌آرآی مغز",
            "category": "paraclinic",
            "approvedRial": 8_500_000,
            "relativeValue": 3.2,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-P-220",
            "titleFa": "سونوگرافی شکم",
            "category": "paraclinic",
            "approvedRial": 2_200_000,
            "relativeValue": 0.85,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-D-310",
            "titleFa": "جرم‌گیری دندان",
            "category": "dental",
            "approvedRial": 1_800_000,
            "relativeValue": 0.6,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-D-320",
            "titleFa": "ترمیم کامپوزیت یک سطحی",
            "category": "dental",
            "approvedRial": 3_200_000,
            "relativeValue": 1.1,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-M-410",
            "titleFa": "زایمان طبیعی",
            "category": "maternity",
            "approvedRial": 65_000_000,
            "relativeValue": 18.0,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
        {
            "serviceCode": "GH-O-510",
            "titleFa": "ویزیت متخصص",
            "category": "outpatient",
            "approvedRial": 650_000,
            "relativeValue": 0.25,
            "source": "DEMO_CALIFORNIA_STUB",
            "active": True,
        },
    ]


def _seed_waiting() -> None:
    global _WAITING
    if _WAITING:
        return
    _WAITING = [
        {
            "benefit": "maternity",
            "waitingDays": 270,
            "notes": "DEMO stub — دوره انتظار زایمان",
            "active": True,
        },
        {
            "benefit": "surgery",
            "waitingDays": 90,
            "notes": "DEMO stub — دوره انتظار جراحی",
            "active": True,
        },
    ]


def _add_ceilings_for_member(member_id: int) -> None:
    global _NEXT_CEILING_ID
    for cat, ceiling in DEFAULT_CEILINGS.items():
        _CEILINGS.append(
            {
                "id": _NEXT_CEILING_ID,
                "memberId": member_id,
                "category": cat,
                "ceilingRial": ceiling,
                "usedRial": 0,
                "remainingRial": ceiling,
                "yearLabel": "1404-DEMO",
            }
        )
        _NEXT_CEILING_ID += 1


def ensure_seed() -> None:
    """Idempotent DEMO contract + members + ceilings + tariff + waiting."""
    global _SEEDED, _NEXT_CONTRACT_ID, _NEXT_MEMBER_ID
    with _STORE_LOCK:
        if _SEEDED:
            return
        _seed_tariff()
        _seed_waiting()
        cid = _NEXT_CONTRACT_ID
        _NEXT_CONTRACT_ID += 1
        _CONTRACTS.append(
            {
                "id": cid,
                "contractCode": "GH-DEMO-3045-001",
                "employerName": "شرکت نمونه کارآفرین (DEMO)",
                "policyNumber": "GH-POL-0001",
                "nationalId": None,
                "policyholderCode": "9001001",
                "productCode": PRODUCT_CODE,
                "insuranceType": None,  # not in locked enum — Eng-extension
                "startDateJalali": "1404/01/01",
                "endDateJalali": "1404/12/29",
                "issueDateJalali": "1403/12/20",
                "franchisePct": float(DEFAULT_FRANCHISE_PCT),
                "case365": {"نمایندگی": "3045", "منبع": "DEMO_SEED"},
                "sourceSystem": "fasihicrm",
                "active": True,
                "notes": "DEMO stub contract",
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        members_seed = [
            ("M-001", "علی رضایی", "0012345678", "self", "1404/01/01", 30),
            ("M-002", "مریم رضایی", "0012345679", "spouse", "1404/01/01", 30),
            ("M-003", "سارا نوری", "0012345680", "self", "1404/06/15", 5),  # recent — waiting
        ]
        for code, name, nid, rel, enroll, days_enrolled in members_seed:
            mid = _NEXT_MEMBER_ID
            _NEXT_MEMBER_ID += 1
            _MEMBERS.append(
                {
                    "id": mid,
                    "contractId": cid,
                    "memberCode": code,
                    "fullName": name,
                    "nationalId": nid,
                    "policyholderCode": "9001001",
                    "relation": rel,
                    "enrollmentJalali": enroll,
                    "daysEnrolled": days_enrolled,  # DEMO stub clock
                    "status": "active",
                    "case365": {},
                    "demoStub": True,
                }
            )
            _add_ceilings_for_member(mid)
            # Pre-use some hospital ceiling on M-001 for remaining demo
            if code == "M-001":
                for c in _CEILINGS:
                    if c["memberId"] == mid and c["category"] == "hospital":
                        c["usedRial"] = 20_000_000
                        c["remainingRial"] = c["ceilingRial"] - c["usedRial"]
        _SEEDED = True


def _find_contract(contract_id: Any) -> dict | None:
    cid = _as_int(contract_id)
    if cid is None:
        return None
    for c in _CONTRACTS:
        if c["id"] == cid:
            return c
    return None


def _find_member(member_id: Any) -> dict | None:
    mid = _as_int(member_id)
    if mid is None:
        return None
    for m in _MEMBERS:
        if m["id"] == mid:
            return m
    return None


def _find_ceiling(member_id: int, category: str) -> dict | None:
    for c in _CEILINGS:
        if c["memberId"] == member_id and c["category"] == category:
            return c
    return None


def _find_tariff(code: str | None) -> dict | None:
    if not code:
        return None
    code_u = str(code).strip().upper()
    for t in _TARIFF:
        if t["serviceCode"].upper() == code_u:
            return t
    return None


def _find_waiting(benefit: str) -> dict | None:
    for w in _WAITING:
        if w["benefit"] == benefit and w.get("active", True):
            return w
    return None


def _contract_franchise(member: dict) -> Decimal:
    c = _find_contract(member["contractId"])
    if c and c.get("franchisePct") is not None:
        return _dec(c["franchisePct"], DEFAULT_FRANCHISE_PCT) or DEFAULT_FRANCHISE_PCT
    return DEFAULT_FRANCHISE_PCT


# --- Pure helpers (tested) ---------------------------------------------------

def remaining_ceiling(ceiling_rial: int, used_rial: int) -> int:
    """سقف مانده تعهد = ceiling - used (floored at 0)."""
    rem = int(ceiling_rial) - int(used_rial)
    return rem if rem > 0 else 0


def compute_claim_payout(
    approved_tariff: int,
    basic_share: int,
    franchise_pct: Decimal | float | int,
    remaining_sublimit: int,
) -> dict:
    """
    ClaimPayout = min((ApprovedTariff - BasicShare) * (1 - Franchise), RemainingSublimit)
    Franchise deducted from net after basic share.
    """
    tariff = Decimal(str(max(0, int(approved_tariff))))
    basic = Decimal(str(max(0, int(basic_share))))
    net = tariff - basic
    if net < 0:
        net = Decimal("0")
    fr = _dec(franchise_pct, DEFAULT_FRANCHISE_PCT) or DEFAULT_FRANCHISE_PCT
    if fr < 0:
        fr = Decimal("0")
    if fr > 100:
        fr = Decimal("100")
    rate = fr / Decimal("100")
    franchise_rial = _q_rial(net * rate)
    after_fr = net - Decimal(franchise_rial)
    if after_fr < 0:
        after_fr = Decimal("0")
    rem = max(0, int(remaining_sublimit))
    payout = min(_q_rial(after_fr), rem)
    return {
        "approvedTariffRial": int(tariff),
        "basicShareRial": int(basic),
        "netAfterBasicRial": _q_rial(net),
        "franchisePct": float(fr),
        "franchiseRial": franchise_rial,
        "afterFranchiseRial": _q_rial(after_fr),
        "remainingSublimitRial": rem,
        "payoutRial": payout,
    }


def check_waiting_block(days_enrolled: int, waiting_days: int) -> dict:
    """Block if days_enrolled < waiting_days."""
    enrolled = max(0, int(days_enrolled))
    need = max(0, int(waiting_days))
    blocked = enrolled < need
    remaining = max(0, need - enrolled) if blocked else 0
    return {
        "blocked": blocked,
        "daysEnrolled": enrolled,
        "waitingDays": need,
        "remainingWaitDays": remaining,
    }


# --- API handlers ------------------------------------------------------------

def meta() -> dict:
    ensure_seed()
    return {
        "ok": True,
        "product": PRODUCT,
        "productLabel": PRODUCT_LABEL,
        "productCode": PRODUCT_CODE,
        "insuranceType": None,
        "engExtension": True,
        "engExtensionNote": ENG_EXTENSION_NOTE,
        "categories": list(CATEGORIES),
        "referralTypes": list(REFERRAL_TYPES),
        "claimKinds": list(CLAIM_KINDS),
        "waitingBenefits": list(WAITING_BENEFITS),
        "defaultFranchisePct": float(DEFAULT_FRANCHISE_PCT),
        "claimFormula": (
            "ClaimPayout=min((ApprovedTariff-BasicShare)*(1-Franchise),RemainingCeiling)"
        ),
        "importAlign": {
            "excelInBatch": False,
            "futureShape": [
                "policy_number",
                "national_id",
                "policyholder_code",
                "case_365",
                "Jalali TEXT yyyy/mm/dd",
            ],
            "handoff": "ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
            "locks": "MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
            "enumNote": "group_health NOT in locked insurance_type enum — use product_code",
        },
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def list_contracts() -> dict:
    ensure_seed()
    with _STORE_LOCK:
        items = []
        for c in _CONTRACTS:
            mc = sum(1 for m in _MEMBERS if m["contractId"] == c["id"] and m["status"] == "active")
            row = copy.deepcopy(c)
            row["memberCount"] = mc
            items.append(row)
        return {
            "ok": True,
            "items": items,
            "count": len(items),
            "productCode": PRODUCT_CODE,
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def get_ceiling(query: dict | None = None, body: dict | None = None) -> dict:
    ensure_seed()
    q = query or {}
    b = body or {}
    member_id = _qs_first(q, "memberId", "member_id") or b.get("memberId") or b.get("member_id")
    category = (
        _qs_first(q, "category") or b.get("category") or "hospital"
    )
    category = str(category).strip().lower()
    member = _find_member(member_id)
    if not member:
        return {"ok": False, "error": "عضو یافت نشد", "memberId": member_id}
    if category not in CATEGORIES:
        return {
            "ok": False,
            "error": f"دسته نامعتبر — مجاز: {', '.join(CATEGORIES)}",
            "category": category,
        }
    with _STORE_LOCK:
        ceil = _find_ceiling(member["id"], category)
        if not ceil:
            return {"ok": False, "error": "سقف برای این دسته تعریف نشده"}
        fr = _contract_franchise(member)
        rem = remaining_ceiling(ceil["ceilingRial"], ceil["usedRial"])
        return {
            "ok": True,
            "memberId": member["id"],
            "memberName": member["fullName"],
            "category": category,
            "ceilingRial": ceil["ceilingRial"],
            "usedRial": ceil["usedRial"],
            "remainingRial": rem,
            "franchisePct": float(fr),
            "yearLabel": ceil.get("yearLabel"),
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def issue_referral(body: dict) -> dict:
    ensure_seed()
    global _NEXT_REFERRAL_ID
    body = body if isinstance(body, dict) else {}
    member = _find_member(body.get("memberId") or body.get("member_id"))
    if not member:
        return {"ok": False, "error": "عضو یافت نشد"}
    if member.get("status") != "active":
        return {"ok": False, "error": "عضو فعال نیست", "blocked": True}

    rtype = str(body.get("type") or body.get("referralType") or "").strip().lower()
    if rtype not in REFERRAL_TYPES:
        return {
            "ok": False,
            "error": f"نوع معرفی‌نامه نامعتبر — مجاز: {', '.join(REFERRAL_TYPES)}",
        }

    # Surgery waiting applies to hospital referrals (DEMO mapping)
    if rtype == "hospital":
        wait = check_waiting_for_member(member["id"], "surgery")
        if wait.get("ok") and wait.get("blocked"):
            return {
                "ok": False,
                "blocked": True,
                "reason": "waiting_period",
                "error": (
                    f"دوره انتظار جراحی فعال است — "
                    f"{wait.get('remainingWaitDays')} روز مانده"
                ),
                "waiting": wait,
            }

    service_code = body.get("serviceCode") or body.get("service_code")
    tariff = _find_tariff(service_code) if service_code else None

    with _STORE_LOCK:
        ceil = _find_ceiling(member["id"], rtype)
        if not ceil:
            return {"ok": False, "error": "سقف تعهد یافت نشد"}
        rem = remaining_ceiling(ceil["ceilingRial"], ceil["usedRial"])
        if rem <= 0:
            return {
                "ok": False,
                "blocked": True,
                "reason": "ceiling_exhausted",
                "error": "سقف مانده تعهد صفر است",
                "remainingRial": 0,
            }
        fr = _contract_franchise(member)
        rid = _NEXT_REFERRAL_ID
        _NEXT_REFERRAL_ID += 1
        row = {
            "id": rid,
            "memberId": member["id"],
            "memberName": member["fullName"],
            "type": rtype,
            "serviceCode": service_code,
            "tariff": copy.deepcopy(tariff) if tariff else None,
            "franchisePct": float(fr),
            "ceilingRemainingRial": rem,
            "status": "issued",
            "issuedAtJalali": body.get("asOfJalali") or body.get("issuedAtJalali") or "1404/06/01",
            "notes": body.get("notes"),
            "demoStub": True,
            "createdAt": iso_now(),
            "disclaimer": DEMO_DISCLAIMER,
        }
        _REFERRALS.append(row)
        return {
            "ok": True,
            "referral": copy.deepcopy(row),
            "preview": {
                "franchisePct": float(fr),
                "ceilingRemainingRial": rem,
                "category": rtype,
            },
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def list_referrals(query: dict | None = None) -> dict:
    ensure_seed()
    mid = _as_int(_qs_first(query or {}, "memberId", "member_id"))
    with _STORE_LOCK:
        items = list(_REFERRALS)
        if mid is not None:
            items = [r for r in items if r["memberId"] == mid]
        items = sorted(items, key=lambda r: r["id"], reverse=True)
        return {
            "ok": True,
            "items": copy.deepcopy(items),
            "count": len(items),
            "demoStub": True,
        }


def register_claim(body: dict) -> dict:
    ensure_seed()
    global _NEXT_CLAIM_ID
    body = body if isinstance(body, dict) else {}
    member = _find_member(body.get("memberId") or body.get("member_id"))
    if not member:
        return {"ok": False, "error": "عضو یافت نشد"}

    kind = str(body.get("kind") or "").strip().lower()
    if kind not in CLAIM_KINDS:
        return {
            "ok": False,
            "error": f"نوع خسارت نامعتبر — مجاز: {', '.join(CLAIM_KINDS)}",
        }

    # Map claim kind → ceiling category
    category = "dental" if kind == "dental" else "paraclinic"
    # Outpatient uses paraclinic ceiling in DEMO (or outpatient tariff category)

    service_code = body.get("serviceCode") or body.get("service_code")
    tariff = _find_tariff(service_code)
    amount = _as_int(body.get("amount") or body.get("invoiceAmount") or body.get("invoice_amount"))
    if amount is None or amount < 0:
        return {"ok": False, "error": "مبلغ فاکتور نامعتبر"}

    basic_share = _as_int(body.get("basicShare") or body.get("basic_share") or 0, 0) or 0

    # Prefer tariff approved amount when code matches; else invoice amount
    if tariff:
        approved = int(tariff["approvedRial"])
        # Cap approval at invoice if invoice lower
        approved = min(approved, amount) if amount else approved
        if kind == "dental" and tariff["category"] != "dental":
            return {
                "ok": False,
                "error": f"کد تعرفه {service_code} با نوع dental سازگار نیست",
                "tariffCategory": tariff["category"],
            }
        if kind == "outpatient" and tariff["category"] not in ("outpatient", "paraclinic"):
            return {
                "ok": False,
                "error": f"کد تعرفه {service_code} با نوع outpatient سازگار نیست",
                "tariffCategory": tariff["category"],
            }
        # Use tariff category for ceiling when outpatient tariff is outpatient
        if kind == "outpatient" and tariff["category"] == "paraclinic":
            category = "paraclinic"
        elif kind == "outpatient":
            # outpatient visits: use paraclinic ceiling bucket in DEMO
            category = "paraclinic"
    else:
        approved = amount
        if service_code:
            return {
                "ok": False,
                "error": f"کد تعرفه یافت نشد: {service_code}",
                "hint": "GET /api/group-health/tariff?code=",
            }

    with _STORE_LOCK:
        ceil = _find_ceiling(member["id"], category)
        if not ceil:
            return {"ok": False, "error": f"سقف دسته {category} یافت نشد"}
        rem = remaining_ceiling(ceil["ceilingRial"], ceil["usedRial"])
        fr = _contract_franchise(member)
        calc = compute_claim_payout(approved, basic_share, fr, rem)

        cid = _NEXT_CLAIM_ID
        _NEXT_CLAIM_ID += 1
        row = {
            "id": cid,
            "memberId": member["id"],
            "memberName": member["fullName"],
            "kind": kind,
            "category": category,
            "serviceCode": service_code,
            "invoiceAmountRial": amount,
            "approvedTariffRial": calc["approvedTariffRial"],
            "basicShareRial": calc["basicShareRial"],
            "franchisePct": calc["franchisePct"],
            "franchiseRial": calc["franchiseRial"],
            "payoutRial": calc["payoutRial"],
            "ceilingRemainingBefore": rem,
            "ceilingRemainingAfter": rem - calc["payoutRial"],
            "tariffMatch": bool(tariff),
            "tariff": copy.deepcopy(tariff) if tariff else None,
            "status": "preview",
            "paymentOrderPreview": {
                "amountRial": calc["payoutRial"],
                "franchiseDeductedRial": calc["franchiseRial"],
                "formula": (
                    "min((ApprovedTariff-BasicShare)*(1-Franchise),RemainingCeiling)"
                ),
            },
            "demoStub": True,
            "createdAt": iso_now(),
            "disclaimer": DEMO_DISCLAIMER,
        }
        _CLAIMS.append(row)
        # DEMO: do not auto-consume ceiling on preview; consumption would be on 'paid'
        return {
            "ok": True,
            "claim": copy.deepcopy(row),
            "calc": calc,
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def list_claims(query: dict | None = None) -> dict:
    ensure_seed()
    mid = _as_int(_qs_first(query or {}, "memberId", "member_id"))
    with _STORE_LOCK:
        items = list(_CLAIMS)
        if mid is not None:
            items = [c for c in items if c["memberId"] == mid]
        items = sorted(items, key=lambda c: c["id"], reverse=True)
        return {
            "ok": True,
            "items": copy.deepcopy(items),
            "count": len(items),
            "demoStub": True,
        }


def get_tariff(query: dict | None = None) -> dict:
    ensure_seed()
    code = _qs_first(query or {}, "code", "serviceCode", "service_code")
    with _STORE_LOCK:
        if code:
            t = _find_tariff(str(code))
            if not t:
                return {
                    "ok": False,
                    "error": f"کد تعرفه یافت نشد: {code}",
                    "items": [],
                    "count": 0,
                }
            return {"ok": True, "item": copy.deepcopy(t), "items": [copy.deepcopy(t)], "count": 1}
        return {
            "ok": True,
            "items": copy.deepcopy(_TARIFF),
            "count": len(_TARIFF),
            "source": "DEMO_CALIFORNIA_STUB",
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def personnel_amendment(body: dict) -> dict:
    """Stub: accept adds/removes arrays or CSV/JSON text — NO wipe of CRM customers."""
    ensure_seed()
    global _NEXT_AMEND_ID, _NEXT_MEMBER_ID
    body = body if isinstance(body, dict) else {}
    contract = _find_contract(body.get("contractId") or body.get("contract_id"))
    if not contract:
        return {"ok": False, "error": "قرارداد یافت نشد"}

    as_of = body.get("asOfJalali") or body.get("as_of_jalali") or "1404/06/01"
    adds = body.get("adds") or []
    removes = body.get("removes") or []

    # Optional stub parse from CSV/JSON text fields (no CRM wipe)
    raw = body.get("csv") or body.get("csvText") or body.get("stubCsv")
    if isinstance(raw, str) and raw.strip():
        parsed_adds, parsed_rems = _parse_personnel_csv(raw)
        adds = list(adds) + parsed_adds
        removes = list(removes) + parsed_rems

    raw_json = body.get("json") or body.get("jsonText") or body.get("stubJson")
    if isinstance(raw_json, str) and raw_json.strip():
        try:
            data = json.loads(raw_json)
            if isinstance(data, dict):
                adds = list(adds) + list(data.get("adds") or [])
                removes = list(removes) + list(data.get("removes") or [])
            elif isinstance(data, list):
                adds = list(adds) + data
        except json.JSONDecodeError:
            return {"ok": False, "error": "JSON نامعتبر"}

    if not isinstance(adds, list):
        adds = []
    if not isinstance(removes, list):
        removes = []

    applied_adds: list[dict] = []
    applied_rems: list[dict] = []

    with _STORE_LOCK:
        for item in adds:
            if isinstance(item, str):
                item = {"memberCode": item, "fullName": item}
            if not isinstance(item, dict):
                continue
            code = str(item.get("memberCode") or item.get("code") or f"ADD-{_NEXT_MEMBER_ID}")
            # skip if already active
            exists = next(
                (
                    m
                    for m in _MEMBERS
                    if m["contractId"] == contract["id"]
                    and m["memberCode"] == code
                    and m["status"] == "active"
                ),
                None,
            )
            if exists:
                continue
            mid = _NEXT_MEMBER_ID
            _NEXT_MEMBER_ID += 1
            row = {
                "id": mid,
                "contractId": contract["id"],
                "memberCode": code,
                "fullName": str(item.get("fullName") or item.get("name") or code),
                "nationalId": item.get("nationalId") or item.get("national_id"),
                "policyholderCode": item.get("policyholderCode")
                or item.get("policyholder_code")
                or contract.get("policyholderCode"),
                "relation": item.get("relation") or "self",
                "enrollmentJalali": as_of,
                "daysEnrolled": 0,
                "status": "active",
                "case365": {},
                "demoStub": True,
                "fromAmendment": True,
            }
            _MEMBERS.append(row)
            _add_ceilings_for_member(mid)
            applied_adds.append({"memberId": mid, "memberCode": code})

        for item in removes:
            code = None
            if isinstance(item, str):
                code = item
            elif isinstance(item, dict):
                code = item.get("memberCode") or item.get("code") or item.get("nationalId")
            if not code:
                continue
            code = str(code)
            for m in _MEMBERS:
                if m["contractId"] != contract["id"]:
                    continue
                if m["memberCode"] == code or m.get("nationalId") == code:
                    if m["status"] == "active":
                        m["status"] = "removed"
                        applied_rems.append({"memberId": m["id"], "memberCode": m["memberCode"]})

        aid = _NEXT_AMEND_ID
        _NEXT_AMEND_ID += 1
        amend = {
            "id": aid,
            "contractId": contract["id"],
            "asOfJalali": as_of,
            "adds": applied_adds,
            "removes": applied_rems,
            "addsCount": len(applied_adds),
            "removesCount": len(applied_rems),
            "status": "stub_recorded",
            "notes": (
                "DEMO stub — الحاقیه لیست؛ بدون wipe مشتریان CRM. "
                "Excel HOLD تا WIPE_GO."
            ),
            "demoStub": True,
            "createdAt": iso_now(),
        }
        _AMENDMENTS.append(amend)
        return {
            "ok": True,
            "amendment": copy.deepcopy(amend),
            "crmWipe": False,
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def _parse_personnel_csv(raw: str) -> tuple[list[dict], list[dict]]:
    """Parse stub CSV: action,memberCode,fullName,nationalId — action=add|remove."""
    adds: list[dict] = []
    removes: list[dict] = []
    reader = csv.DictReader(io.StringIO(raw.strip()))
    if not reader.fieldnames:
        return adds, removes
    for row in reader:
        action = (row.get("action") or row.get("Action") or "add").strip().lower()
        item = {
            "memberCode": (row.get("memberCode") or row.get("code") or "").strip(),
            "fullName": (row.get("fullName") or row.get("name") or "").strip(),
            "nationalId": (row.get("nationalId") or row.get("national_id") or "").strip()
            or None,
        }
        if not item["memberCode"]:
            continue
        if action in ("remove", "delete", "del"):
            removes.append(item)
        else:
            adds.append(item)
    return adds, removes


def check_waiting_for_member(member_id: Any, benefit: str) -> dict:
    ensure_seed()
    member = _find_member(member_id)
    if not member:
        return {"ok": False, "error": "عضو یافت نشد"}
    benefit = str(benefit).strip().lower()
    if benefit not in WAITING_BENEFITS:
        return {
            "ok": False,
            "error": f"مزیت نامعتبر — مجاز: {', '.join(WAITING_BENEFITS)}",
        }
    rule = _find_waiting(benefit)
    if not rule:
        return {"ok": False, "error": "قانون انتظار یافت نشد"}
    days = int(member.get("daysEnrolled") or 0)
    block = check_waiting_block(days, int(rule["waitingDays"]))
    return {
        "ok": True,
        "memberId": member["id"],
        "memberName": member["fullName"],
        "benefit": benefit,
        "enrollmentJalali": member.get("enrollmentJalali"),
        **block,
        "ruleNotes": rule.get("notes"),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def get_waiting(query: dict | None = None) -> dict:
    ensure_seed()
    q = query or {}
    member_id = _qs_first(q, "memberId", "member_id")
    benefit = _qs_first(q, "benefit") or "maternity"
    if member_id is not None:
        return check_waiting_for_member(member_id, str(benefit))
    with _STORE_LOCK:
        return {
            "ok": True,
            "rules": copy.deepcopy(_WAITING),
            "count": len(_WAITING),
            "demoStub": True,
        }


def list_members(query: dict | None = None) -> dict:
    ensure_seed()
    cid = _as_int(_qs_first(query or {}, "contractId", "contract_id"))
    with _STORE_LOCK:
        items = list(_MEMBERS)
        if cid is not None:
            items = [m for m in items if m["contractId"] == cid]
        return {"ok": True, "items": copy.deepcopy(items), "count": len(items), "demoStub": True}


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


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
) -> tuple[int, dict]:
    """Route group-health API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/group-health/meta" and method == "GET":
        return 200, meta()

    if path == "/api/group-health/contracts" and method == "GET":
        return 200, list_contracts()

    if path == "/api/group-health/members" and method == "GET":
        return 200, list_members(query)

    if path == "/api/group-health/ceiling" and method == "GET":
        result = get_ceiling(query, body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/group-health/referral" and method == "POST":
        result = issue_referral(body)
        code = 200 if result.get("ok") else (403 if result.get("blocked") else 400)
        return code, result

    if path == "/api/group-health/referrals" and method == "GET":
        return 200, list_referrals(query)

    if path == "/api/group-health/claims":
        if method == "POST":
            result = register_claim(body)
            return (200 if result.get("ok") else 400), result
        if method == "GET":
            return 200, list_claims(query)

    if path == "/api/group-health/tariff" and method == "GET":
        result = get_tariff(query)
        return (200 if result.get("ok") else 404), result

    if path == "/api/group-health/personnel/amendment" and method == "POST":
        result = personnel_amendment(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/group-health/waiting" and method == "GET":
        result = get_waiting(query)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
