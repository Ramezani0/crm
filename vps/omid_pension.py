"""M3 امید بازنشستگی — Omid Pension (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 004.
NEVER touches / wipes customers/policies/installments/sima_zar/sales_network.

Phases: accumulation → guaranteed_10y (years 0–9) → lifetime (year 10+).
Compound: MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N  (DEMO labeled).
Import align (n5.xlsx / omid_retirement): plan links policy_number + national_id
(+ optional policyholder_code); extra/پرونده_365 for Omid columns. Excel HOLD.
"""
from __future__ import annotations

import copy
import math
import threading
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import Any

getcontext().prec = 28

# --- Constants ---------------------------------------------------------------
PRODUCT = "omid_pension"
PRODUCT_LABEL = "امید بازنشستگی"
INSURANCE_TYPE = "omid_retirement"  # n5.xlsx lock
COMPOUND_RATE = Decimal("0.10")  # 10% annual compound
RETIREMENT_AGE_MIN = 50
RETIREMENT_AGE_MAX = 61
GUARANTEED_YEARS = 10  # years 0..9 inclusive = 120 months
PHASE_ACCUMULATION = "accumulation"
PHASE_GUARANTEED = "guaranteed_10y"
PHASE_LIFETIME = "lifetime"
PHASES = (PHASE_ACCUMULATION, PHASE_GUARANTEED, PHASE_LIFETIME)

POL_PENDING = "pending"
POL_CONFIRMED = "confirmed"
POL_EXPIRED = "expired"
POL_STATUSES = (POL_PENDING, POL_CONFIRMED, POL_EXPIRED)

# DEMO stub: initial monthly ≈ accumulation / (12 * DEMO_ANNUITY_YEARS)
DEMO_ANNUITY_YEARS = 20
DEFAULT_ACCUMULATION_RIAL = 240_000_000  # DEMO placeholder

LOAN_SURRENDER_BLOCK_REASON_FA = "در فاز مستمری، وام و بازخرید قفل است"
DEMO_DISCLAIMER = (
    "DEMO — فرمول نمونه اسکلت؛ اکچوئری رسمی پس از WIPE_GO/اکسل. "
    "MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N"
)

_STORE_LOCK = threading.RLock()
_PLANS: list[dict] = []
_SCHEDULES: list[dict] = []  # payout schedule rows
_PAYOUTS: list[dict] = []
_BENEFICIARIES: list[dict] = []
_POL_CHECKS: list[dict] = []
_NEXT_PLAN_ID = 1
_NEXT_SCHED_ID = 1
_NEXT_PAYOUT_ID = 1
_NEXT_BEN_ID = 1
_NEXT_POL_ID = 1
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


def reset_store_for_tests() -> None:
    global _PLANS, _SCHEDULES, _PAYOUTS, _BENEFICIARIES, _POL_CHECKS
    global _NEXT_PLAN_ID, _NEXT_SCHED_ID, _NEXT_PAYOUT_ID, _NEXT_BEN_ID, _NEXT_POL_ID, _SEEDED
    with _STORE_LOCK:
        _PLANS = []
        _SCHEDULES = []
        _PAYOUTS = []
        _BENEFICIARIES = []
        _POL_CHECKS = []
        _NEXT_PLAN_ID = 1
        _NEXT_SCHED_ID = 1
        _NEXT_PAYOUT_ID = 1
        _NEXT_BEN_ID = 1
        _NEXT_POL_ID = 1
        _SEEDED = False


def validate_retirement_age(age: Any) -> tuple[bool, int | None, str | None]:
    try:
        a = int(age)
    except (TypeError, ValueError):
        return False, None, f"سن بازنشستگی باید عدد {RETIREMENT_AGE_MIN}–{RETIREMENT_AGE_MAX} باشد"
    if a < RETIREMENT_AGE_MIN or a > RETIREMENT_AGE_MAX:
        return False, None, f"سن بازنشستگی باید بین {RETIREMENT_AGE_MIN} تا {RETIREMENT_AGE_MAX} باشد"
    return True, a, None


def compound_monthly(base_monthly: Any, year_index: int) -> int:
    """MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N  (N = year_index ≥ 0)."""
    base = _dec(base_monthly, Decimal("0")) or Decimal("0")
    if year_index < 0:
        year_index = 0
    factor = (Decimal("1") + COMPOUND_RATE) ** int(year_index)
    return _q_rial(base * factor)


def demo_initial_monthly(accumulation_rial: Any, accumulation_years: int = 0) -> int:
    """DEMO stub: Acc / (12 * DEMO_ANNUITY_YEARS), slight bump for longer accumulation."""
    acc = _dec(accumulation_rial, Decimal(str(DEFAULT_ACCUMULATION_RIAL))) or Decimal(
        str(DEFAULT_ACCUMULATION_RIAL)
    )
    years = max(1, int(accumulation_years or 1))
    # Mild DEMO adjust: +0.5% per accumulation year beyond 10 (capped)
    bump = Decimal("1") + Decimal("0.005") * Decimal(str(max(0, years - 10)))
    bump = min(bump, Decimal("1.10"))
    monthly = (acc * bump) / (Decimal("12") * Decimal(str(DEMO_ANNUITY_YEARS)))
    return max(1, _q_rial(monthly))


def _ensure_seeded() -> None:
    global _SEEDED
    with _STORE_LOCK:
        if _SEEDED:
            return
        # One DEMO plan in accumulation (import-shaped keys)
        plan = _new_plan_dict(
            {
                "customerId": 1,
                "customerLabel": "نمونه امید بازنشستگی",
                "policyNumber": "OMID-DEMO-0001",
                "nationalId": "0012345678",
                "policyholderCode": None,
                "retirementAge": 55,
                "accumulationYears": 15,
                "accumulationRial": DEFAULT_ACCUMULATION_RIAL,
                "phase": PHASE_ACCUMULATION,
                "issueDateJalali": "1402/01/15",
                "startDateJalali": "1402/01/15",
                "endDateJalali": "1422/01/14",
                "life_policy_meta": {
                    "first_year_end_reserve": DEFAULT_ACCUMULATION_RIAL,
                    "premium_escalate_pct": 10,
                    "sum_insured_escalate_pct": 10,
                },
                "extra": {
                    "پرونده_365": {
                        "نمایندگی": "3045",
                        "مدت بیمه نامه": "20",
                        "مدت پرداخت": "15",
                        "اندوخته پایان سال اول": DEFAULT_ACCUMULATION_RIAL,
                        "درصد افزایش سالانه حق بیمه": 10,
                        "درصد افزایش سالانه سرمایه": 10,
                        "insurance_type": INSURANCE_TYPE,
                    },
                    "insurance_type": INSURANCE_TYPE,
                    "source": "DEMO_SEED",
                },
            }
        )
        _PLANS.append(plan)
        _BENEFICIARIES.append(
            {
                "id": 1,
                "planId": plan["id"],
                "name": "ذی‌نفع نمونه",
                "nationalId": None,
                "relation": "spouse",
                "sharePct": 100,
                "stub": True,
                "createdAt": iso_now(),
            }
        )
        global _NEXT_BEN_ID
        _NEXT_BEN_ID = 2
        _POL_CHECKS.append(
            {
                "id": 1,
                "planId": plan["id"],
                "status": POL_PENDING,
                "method": "TODO_SMS_OR_SABTAHVAL",
                "checkedAt": None,
                "expiresAt": None,
                "notes": "SMS/SabtAhval PoL — TODO later",
                "createdAt": iso_now(),
                "updatedAt": iso_now(),
            }
        )
        global _NEXT_POL_ID
        _NEXT_POL_ID = 2
        _SEEDED = True


def _new_plan_dict(body: dict) -> dict:
    global _NEXT_PLAN_ID
    pid = _NEXT_PLAN_ID
    _NEXT_PLAN_ID += 1
    age_ok, age, _ = validate_retirement_age(body.get("retirementAge", body.get("retirement_age", 55)))
    if not age_ok:
        age = 55
    acc_years = int(body.get("accumulationYears") or body.get("accumulation_years") or 10)
    acc_rial = _dec(
        body.get("accumulationRial", body.get("accumulation_rial")),
        Decimal(str(DEFAULT_ACCUMULATION_RIAL)),
    ) or Decimal(str(DEFAULT_ACCUMULATION_RIAL))
    initial = demo_initial_monthly(acc_rial, acc_years)
    phase = (body.get("phase") or PHASE_ACCUMULATION).strip()
    if phase not in PHASES:
        phase = PHASE_ACCUMULATION
    payout_locked = phase != PHASE_ACCUMULATION
    extra = body.get("extra") if isinstance(body.get("extra"), dict) else {}
    # Accept پرونده_365 / case_365 alias at top level (Persian keys OK)
    for alias in ("پرونده_365", "case_365", "dossier365", "case365"):
        if alias in body:
            bag = body[alias]
            if isinstance(bag, dict):
                extra = dict(extra)
                existing = extra.get("پرونده_365") if isinstance(extra.get("پرونده_365"), dict) else {}
                merged_bag = dict(existing)
                merged_bag.update(bag)
                extra["پرونده_365"] = merged_bag
    extra.setdefault("insurance_type", INSURANCE_TYPE)

    # life_policy_meta (Import handoff) — land n5 fields; do NOT recompute premiums
    meta_in = body.get("lifePolicyMeta") or body.get("life_policy_meta") or {}
    if not isinstance(meta_in, dict):
        meta_in = {}
    life_meta = {
        "first_year_end_reserve": _dec(
            meta_in.get("first_year_end_reserve", body.get("firstYearEndReserve", body.get("first_year_end_reserve"))),
            None,
        ),
        "premium_escalate_pct": _dec(
            meta_in.get("premium_escalate_pct", body.get("premiumEscalatePct", body.get("premium_escalate_pct"))),
            None,
        ),
        "sum_insured_escalate_pct": _dec(
            meta_in.get(
                "sum_insured_escalate_pct",
                body.get("sumInsuredEscalatePct", body.get("sum_insured_escalate_pct")),
            ),
            None,
        ),
        "initial_reserve": _dec(meta_in.get("initial_reserve", body.get("initialReserve")), None),
        "annual_premium": _dec(meta_in.get("annual_premium", body.get("annualPremium", body.get("حق بیمه سالانه"))), None),
    }
    # Prefer first_year_end_reserve as accumulation seed when provided (n5)
    fyr = life_meta.get("first_year_end_reserve")
    if fyr is not None and fyr > 0 and body.get("accumulationRial") is None and body.get("accumulation_rial") is None:
        acc_rial = fyr
        initial = demo_initial_monthly(acc_rial, acc_years)
    life_meta_out = {
        k: (float(v) if isinstance(v, Decimal) else v)
        for k, v in life_meta.items()
        if v is not None
    }

    # Jalali dates as TEXT yyyy/mm/dd — no Gregorian conversion
    def _jalali_text(val: Any) -> str | None:
        if val is None:
            return None
        s = str(val).strip()
        return s or None

    return {
        "id": pid,
        "customerId": body.get("customerId") or body.get("customer_id"),
        "customerLabel": (body.get("customerLabel") or body.get("customer_label") or "").strip()
        or "—",
        "policyNumber": (body.get("policyNumber") or body.get("policy_number") or "").strip()
        or None,
        "nationalId": (body.get("nationalId") or body.get("national_id") or "").strip() or None,
        "policyholderCode": (
            body.get("policyholderCode")
            or body.get("policyholder_code")
            or body.get("holderCode")
            or None
        ),
        "insuranceType": INSURANCE_TYPE,
        "issueDateJalali": _jalali_text(body.get("issueDateJalali") or body.get("issue_date_jalali") or body.get("تاریخ صدور")),
        "startDateJalali": _jalali_text(body.get("startDateJalali") or body.get("start_date_jalali") or body.get("تاریخ شروع")),
        "endDateJalali": _jalali_text(body.get("endDateJalali") or body.get("end_date_jalali") or body.get("تاریخ پایان")),
        "retirementAge": age,
        "accumulationYears": acc_years,
        "accumulationRial": int(acc_rial),
        "initialMonthlyRial": initial,
        "lifePolicyMeta": life_meta_out,
        "phase": phase,
        "loanBlocked": payout_locked,
        "surrenderBlocked": payout_locked,
        "alive": True,
        "deathAt": None,
        "transitionAt": None,
        "currentYearIndex": 0,
        "currentMonthIndex": 0,
        "extra": extra,
        "sourceSystem": body.get("sourceSystem") or body.get("source_system") or "fasihicrm",
        "demoStub": True,
        "createdAt": iso_now(),
        "updatedAt": iso_now(),
        "notes": body.get("notes") or "",
    }


def _public_plan(p: dict) -> dict:
    return {
        "id": p["id"],
        "customerId": p.get("customerId"),
        "customerLabel": p.get("customerLabel"),
        "policyNumber": p.get("policyNumber"),
        "nationalId": p.get("nationalId"),
        "policyholderCode": p.get("policyholderCode"),
        "insuranceType": INSURANCE_TYPE,
        "issueDateJalali": p.get("issueDateJalali"),
        "startDateJalali": p.get("startDateJalali"),
        "endDateJalali": p.get("endDateJalali"),
        "retirementAge": p.get("retirementAge"),
        "accumulationYears": p.get("accumulationYears"),
        "accumulationRial": p.get("accumulationRial"),
        "initialMonthlyRial": p.get("initialMonthlyRial"),
        "lifePolicyMeta": p.get("lifePolicyMeta") or {},
        "sourceSystem": p.get("sourceSystem") or "fasihicrm",
        "phase": p.get("phase"),
        "loanBlocked": bool(p.get("loanBlocked")),
        "surrenderBlocked": bool(p.get("surrenderBlocked")),
        "alive": bool(p.get("alive", True)),
        "deathAt": p.get("deathAt"),
        "transitionAt": p.get("transitionAt"),
        "currentYearIndex": int(p.get("currentYearIndex") or 0),
        "currentMonthIndex": int(p.get("currentMonthIndex") or 0),
        "extra": p.get("extra") or {},
        "demoStub": True,
        "product": PRODUCT,
        "productLabel": PRODUCT_LABEL,
        "createdAt": p.get("createdAt"),
        "updatedAt": p.get("updatedAt"),
        "notes": p.get("notes") or "",
        "disclaimer": DEMO_DISCLAIMER,
    }


def _find_plan(plan_id: Any) -> dict | None:
    try:
        pid = int(plan_id)
    except (TypeError, ValueError):
        return None
    for p in _PLANS:
        if int(p["id"]) == pid:
            return p
    return None


def _pol_for_plan(plan_id: int) -> dict | None:
    best = None
    for c in _POL_CHECKS:
        if int(c["planId"]) == int(plan_id):
            best = c
    return best


def meta() -> dict:
    return {
        "ok": True,
        "module": "omid_pension_m3",
        "product": PRODUCT,
        "productLabel": PRODUCT_LABEL,
        "insuranceType": INSURANCE_TYPE,
        "phases": list(PHASES),
        "retirementAgeMin": RETIREMENT_AGE_MIN,
        "retirementAgeMax": RETIREMENT_AGE_MAX,
        "compoundRate": float(COMPOUND_RATE),
        "compoundFormula": "MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N",
        "guaranteedYears": GUARANTEED_YEARS,
        "demoAnnuityYears": DEMO_ANNUITY_YEARS,
        "polStatuses": list(POL_STATUSES),
        "importAlign": {
            "source": "n5.xlsx",
            "insurance_type": INSURANCE_TYPE,
            "insuranceTypeEnumIncludes": INSURANCE_TYPE,
            "planKeys": ["policy_number", "national_id", "policyholder_code?"],
            "lifePolicyMeta": [
                "first_year_end_reserve",
                "premium_escalate_pct",
                "sum_insured_escalate_pct",
            ],
            "case365": "پرونده_365 / case_365 — Persian keys OK",
            "jalaliDates": "TEXT yyyy/mm/dd — no Gregorian",
            "engOwns": ["10pct_compound_schedule", "proof_of_life", "loan_surrender_lock_in_payout"],
            "importDoesNot": ["recompute_historical_premiums", "compound_pension"],
            "excelHold": True,
            "handoff": [
                "/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
                "/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
            ],
            "note": "holder parse fail on n5 → join via national_id until WIPE_GO",
        },
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def simulate(body: dict | None = None, query: dict | None = None) -> dict:
    """Estimate initial monthly + year projections (DEMO)."""
    merged: dict[str, Any] = {}
    if query:
        for k, v in query.items():
            if isinstance(v, list):
                merged[k] = v[0] if v else None
            else:
                merged[k] = v
    if isinstance(body, dict):
        merged.update(body)

    age_raw = merged.get("retirementAge", merged.get("retirement_age"))
    ok, age, err = validate_retirement_age(age_raw if age_raw is not None else 55)
    if not ok:
        return {"ok": False, "error": err, "demoStub": True}

    try:
        acc_years = int(merged.get("accumulationYears") or merged.get("accumulation_years") or 10)
    except (TypeError, ValueError):
        return {"ok": False, "error": "سال‌های انباشت نامعتبر", "demoStub": True}
    if acc_years < 1 or acc_years > 60:
        return {"ok": False, "error": "سال‌های انباشت باید ۱ تا ۶۰ باشد", "demoStub": True}

    acc_rial = _dec(
        merged.get("accumulationRial", merged.get("accumulation_rial")),
        Decimal(str(DEFAULT_ACCUMULATION_RIAL)),
    )
    if acc_rial is None or acc_rial <= 0:
        return {"ok": False, "error": "اندوخته ریالی نامعتبر", "demoStub": True}

    initial = demo_initial_monthly(acc_rial, acc_years)
    years_preview = []
    for n in range(0, GUARANTEED_YEARS + 5):  # 0..14
        phase = PHASE_GUARANTEED if n < GUARANTEED_YEARS else PHASE_LIFETIME
        years_preview.append(
            {
                "yearIndex": n,
                "monthlyRial": compound_monthly(initial, n),
                "phase": phase,
                "formula": f"{initial} * (1.10)^{n}",
            }
        )

    return {
        "ok": True,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
        "retirementAge": age,
        "accumulationYears": acc_years,
        "accumulationRial": int(acc_rial),
        "initialMonthlyRial": initial,
        "compoundRate": float(COMPOUND_RATE),
        "formula": "MonthlyPension_yearN = MonthlyPension_0 * (1.10)^N",
        "guaranteedYears": GUARANTEED_YEARS,
        "yearsPreview": years_preview,
        "insuranceType": INSURANCE_TYPE,
    }


def list_plans(query: dict | None = None) -> dict:
    _ensure_seeded()
    q = query or {}
    pn = _qs_first(q, "policyNumber", "policy_number")
    nid = _qs_first(q, "nationalId", "national_id")
    phc = _qs_first(q, "policyholderCode", "policyholder_code")
    with _STORE_LOCK:
        items = []
        for p in _PLANS:
            if pn and str(p.get("policyNumber") or "") != str(pn):
                continue
            if nid and str(p.get("nationalId") or "") != str(nid):
                continue
            if phc and str(p.get("policyholderCode") or "") != str(phc):
                continue
            items.append(_public_plan(p))
    return {
        "ok": True,
        "items": items,
        "count": len(items),
        "demoStub": True,
        "insuranceType": INSURANCE_TYPE,
    }


def create_plan(body: dict) -> dict:
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    age_raw = body.get("retirementAge", body.get("retirement_age", 55))
    ok, _age, err = validate_retirement_age(age_raw)
    if not ok:
        return {"ok": False, "error": err, "demoStub": True}
    with _STORE_LOCK:
        plan = _new_plan_dict(body)
        plan["phase"] = PHASE_ACCUMULATION
        plan["loanBlocked"] = False
        plan["surrenderBlocked"] = False
        _PLANS.append(plan)
        # stub beneficiary
        global _NEXT_BEN_ID
        ben = {
            "id": _NEXT_BEN_ID,
            "planId": plan["id"],
            "name": (body.get("beneficiaryName") or "ذی‌نفع نمونه").strip(),
            "nationalId": body.get("beneficiaryNationalId"),
            "relation": body.get("beneficiaryRelation") or "heir",
            "sharePct": 100,
            "stub": True,
            "createdAt": iso_now(),
        }
        _NEXT_BEN_ID += 1
        _BENEFICIARIES.append(ben)
        # PoL pending
        global _NEXT_POL_ID
        pol = {
            "id": _NEXT_POL_ID,
            "planId": plan["id"],
            "status": POL_PENDING,
            "method": "TODO_SMS_OR_SABTAHVAL",
            "checkedAt": None,
            "expiresAt": None,
            "notes": "SMS/SabtAhval PoL — TODO later",
            "createdAt": iso_now(),
            "updatedAt": iso_now(),
        }
        _NEXT_POL_ID += 1
        _POL_CHECKS.append(pol)
        pub = _public_plan(plan)
    return {
        "ok": True,
        "plan": pub,
        "beneficiary": ben,
        "proofOfLife": {"status": POL_PENDING, "method": pol["method"]},
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def transition(body: dict) -> dict:
    """accumulation → guaranteed_10y + build 120-month schedule. Locks loan/surrender."""
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    plan_id = body.get("planId") or body.get("plan_id")
    with _STORE_LOCK:
        plan = _find_plan(plan_id)
        if not plan:
            return {"ok": False, "error": "طرح یافت نشد"}
        if plan.get("phase") != PHASE_ACCUMULATION:
            return {
                "ok": False,
                "error": f"انتقال فقط از accumulation؛ فاز فعلی: {plan.get('phase')}",
                "plan": _public_plan(plan),
            }
        if not plan.get("alive", True):
            return {"ok": False, "error": "طرح فوت‌شده قابل انتقال نیست"}

        plan["phase"] = PHASE_GUARANTEED
        plan["loanBlocked"] = True
        plan["surrenderBlocked"] = True
        plan["transitionAt"] = iso_now()
        plan["currentYearIndex"] = 0
        plan["currentMonthIndex"] = 0
        plan["updatedAt"] = iso_now()
        initial = int(plan["initialMonthlyRial"])

        # Clear prior schedule for this plan (idempotent re-entry guard — shouldn't happen)
        global _SCHEDULES, _NEXT_SCHED_ID
        _SCHEDULES = [s for s in _SCHEDULES if int(s["planId"]) != int(plan["id"])]

        created = []
        for month in range(0, GUARANTEED_YEARS * 12):  # 0..119
            year_index = month // 12
            monthly = compound_monthly(initial, year_index)
            global _NEXT_SCHED_ID
            row = {
                "id": _NEXT_SCHED_ID,
                "planId": plan["id"],
                "monthIndex": month,
                "yearIndex": year_index,
                "phase": PHASE_GUARANTEED,
                "amountRial": monthly,
                "status": "scheduled",  # scheduled|paid|skipped|beneficiary|stopped
                "dueLabel": f"Y{year_index}-M{(month % 12) + 1}",
                "paidAt": None,
                "payee": "annuitant",
                "createdAt": iso_now(),
            }
            _NEXT_SCHED_ID += 1
            _SCHEDULES.append(row)
            created.append(row)

        pub = _public_plan(plan)

    return {
        "ok": True,
        "plan": pub,
        "scheduleCount": len(created),
        "guaranteedMonths": GUARANTEED_YEARS * 12,
        "loanBlocked": True,
        "surrenderBlocked": True,
        "blockReason": LOAN_SURRENDER_BLOCK_REASON_FA,
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
        "schedulePreview": created[:12],  # first year
    }


def get_schedule(plan_id: Any) -> dict:
    _ensure_seeded()
    with _STORE_LOCK:
        plan = _find_plan(plan_id)
        if not plan:
            return {"ok": False, "error": "طرح یافت نشد"}
        rows = [copy.deepcopy(s) for s in _SCHEDULES if int(s["planId"]) == int(plan["id"])]
        rows.sort(key=lambda r: int(r["monthIndex"]))
        pol = _pol_for_plan(int(plan["id"]))
    return {
        "ok": True,
        "planId": int(plan["id"]),
        "phase": plan.get("phase"),
        "items": rows,
        "count": len(rows),
        "proofOfLife": {
            "status": (pol or {}).get("status", POL_PENDING),
            "blocksAdvance": (pol or {}).get("status") != POL_CONFIRMED,
        },
        "demoStub": True,
    }


def payout_preview(body: dict) -> dict:
    """Next month amount with 10% compound year index. Blocks if PoL not confirmed."""
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    plan_id = body.get("planId") or body.get("plan_id")
    with _STORE_LOCK:
        plan = _find_plan(plan_id)
        if not plan:
            return {"ok": False, "error": "طرح یافت نشد"}
        if plan.get("phase") == PHASE_ACCUMULATION:
            return {"ok": False, "error": "هنوز در فاز انباشت — ابتدا transition کنید"}
        if not plan.get("alive", True) and plan.get("phase") == PHASE_LIFETIME:
            return {"ok": False, "error": "فاز مادام‌العمر پس از فوت متوقف است", "stopped": True}

        pol = _pol_for_plan(int(plan["id"]))
        pol_status = (pol or {}).get("status", POL_PENDING)
        if pol_status != POL_CONFIRMED:
            return {
                "ok": False,
                "error": "گواهی حیات تأیید نشده — پیشروی زمان‌بندی مسدود است",
                "proofOfLifeStatus": pol_status,
                "blocked": True,
                "demoStub": True,
            }

        year_index = int(plan.get("currentYearIndex") or 0)
        month_index = int(plan.get("currentMonthIndex") or 0)
        # Allow override for preview
        if body.get("yearIndex") is not None:
            try:
                year_index = int(body["yearIndex"])
            except (TypeError, ValueError):
                pass
        if body.get("monthIndex") is not None:
            try:
                month_index = int(body["monthIndex"])
            except (TypeError, ValueError):
                pass

        phase = plan.get("phase")
        if year_index >= GUARANTEED_YEARS:
            phase = PHASE_LIFETIME
        elif phase == PHASE_GUARANTEED and year_index >= GUARANTEED_YEARS:
            phase = PHASE_LIFETIME

        amount = compound_monthly(plan["initialMonthlyRial"], year_index)
        payee = "annuitant"
        if not plan.get("alive", True) and phase == PHASE_GUARANTEED:
            payee = "beneficiary"

        return {
            "ok": True,
            "planId": int(plan["id"]),
            "yearIndex": year_index,
            "monthIndex": month_index,
            "phase": phase,
            "amountRial": amount,
            "formula": f"{plan['initialMonthlyRial']} * (1.10)^{year_index}",
            "payee": payee,
            "proofOfLifeStatus": pol_status,
            "loanBlocked": True,
            "surrenderBlocked": True,
            "demoStub": True,
            "disclaimer": DEMO_DISCLAIMER,
        }


def record_death(body: dict) -> dict:
    """Death: guaranteed → remaining schedule to beneficiary; lifetime → stop."""
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    plan_id = body.get("planId") or body.get("plan_id")
    with _STORE_LOCK:
        plan = _find_plan(plan_id)
        if not plan:
            return {"ok": False, "error": "طرح یافت نشد"}
        if not plan.get("alive", True):
            return {"ok": False, "error": "فوت قبلاً ثبت شده", "plan": _public_plan(plan)}

        plan["alive"] = False
        plan["deathAt"] = iso_now()
        plan["updatedAt"] = iso_now()
        phase = plan.get("phase")

        bens = [b for b in _BENEFICIARIES if int(b["planId"]) == int(plan["id"])]
        remaining = []
        stopped = False

        if phase == PHASE_ACCUMULATION:
            # Death in accumulation — stub: mark closed, no payout schedule
            plan["phase"] = PHASE_ACCUMULATION
            action = "accumulation_death_stub"
            message = "فوت در فاز انباشت — اسکلت: بدون جدول مستمری (اکچوئری بعدی)"
        elif phase == PHASE_GUARANTEED:
            action = "beneficiary_remaining"
            message = "باقی‌مانده دوره تضمینی به ذی‌نفع منتقل شد"
            for s in _SCHEDULES:
                if int(s["planId"]) == int(plan["id"]) and s.get("status") == "scheduled":
                    s["status"] = "beneficiary"
                    s["payee"] = "beneficiary"
                    remaining.append(copy.deepcopy(s))
        elif phase == PHASE_LIFETIME:
            action = "lifetime_stop"
            message = "فاز مادام‌العمر با فوت متوقف شد"
            stopped = True
            for s in _SCHEDULES:
                if int(s["planId"]) == int(plan["id"]) and s.get("status") == "scheduled":
                    s["status"] = "stopped"
        else:
            action = "unknown"
            message = f"فاز ناشناخته: {phase}"

        pub = _public_plan(plan)

    return {
        "ok": True,
        "action": action,
        "message": message,
        "plan": pub,
        "beneficiary": bens[0] if bens else None,
        "remainingScheduleCount": len(remaining),
        "remainingPreview": remaining[:6],
        "stopped": stopped,
        "demoStub": True,
    }


def get_proof_of_life(query: dict | None = None) -> dict:
    _ensure_seeded()
    plan_id = _qs_first(query or {}, "planId", "plan_id")
    with _STORE_LOCK:
        if plan_id is not None:
            plan = _find_plan(plan_id)
            if not plan:
                return {"ok": False, "error": "طرح یافت نشد"}
            pol = _pol_for_plan(int(plan["id"]))
            return {
                "ok": True,
                "planId": int(plan["id"]),
                "status": (pol or {}).get("status", POL_PENDING),
                "method": (pol or {}).get("method", "TODO_SMS_OR_SABTAHVAL"),
                "checkedAt": (pol or {}).get("checkedAt"),
                "expiresAt": (pol or {}).get("expiresAt"),
                "notes": (pol or {}).get("notes"),
                "blocksPayoutAdvance": (pol or {}).get("status") != POL_CONFIRMED,
                "todo": "SMS / استعلام ثبت احوال — TODO later",
                "demoStub": True,
            }
        items = []
        for c in _POL_CHECKS:
            items.append(copy.deepcopy(c))
    return {"ok": True, "items": items, "count": len(items), "demoStub": True}


def post_proof_of_life(body: dict) -> dict:
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    plan_id = body.get("planId") or body.get("plan_id")
    status = (body.get("status") or POL_CONFIRMED).strip()
    if status not in POL_STATUSES:
        return {"ok": False, "error": f"وضعیت نامعتبر؛ مجاز: {', '.join(POL_STATUSES)}"}
    with _STORE_LOCK:
        plan = _find_plan(plan_id)
        if not plan:
            return {"ok": False, "error": "طرح یافت نشد"}
        pol = _pol_for_plan(int(plan["id"]))
        now = iso_now()
        if not pol:
            global _NEXT_POL_ID
            pol = {
                "id": _NEXT_POL_ID,
                "planId": int(plan["id"]),
                "status": status,
                "method": body.get("method") or "TODO_SMS_OR_SABTAHVAL",
                "checkedAt": now if status == POL_CONFIRMED else None,
                "expiresAt": body.get("expiresAt"),
                "notes": body.get("notes") or "SMS/SabtAhval PoL — TODO later",
                "createdAt": now,
                "updatedAt": now,
            }
            _NEXT_POL_ID += 1
            _POL_CHECKS.append(pol)
        else:
            pol["status"] = status
            pol["updatedAt"] = now
            if status == POL_CONFIRMED:
                pol["checkedAt"] = now
            if body.get("method"):
                pol["method"] = body["method"]
            if body.get("notes"):
                pol["notes"] = body["notes"]
            if body.get("expiresAt"):
                pol["expiresAt"] = body["expiresAt"]

    return {
        "ok": True,
        "planId": int(plan["id"]),
        "status": pol["status"],
        "method": pol.get("method"),
        "checkedAt": pol.get("checkedAt"),
        "blocksPayoutAdvance": pol["status"] != POL_CONFIRMED,
        "todo": "SMS / استعلام ثبت احوال — TODO later",
        "demoStub": True,
    }


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
    """Route omid-pension API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/omid-pension/meta" and method == "GET":
        return 200, meta()

    if path == "/api/omid-pension/simulate":
        if method in ("GET", "POST"):
            result = simulate(body, query)
            return (200 if result.get("ok") else 400), result

    if path == "/api/omid-pension/plans":
        if method == "GET":
            return 200, list_plans(query)
        if method == "POST":
            result = create_plan(body)
            return (200 if result.get("ok") else 400), result

    if path == "/api/omid-pension/transition" and method == "POST":
        result = transition(body)
        return (200 if result.get("ok") else 400), result

    if path.startswith("/api/omid-pension/schedule/") and method == "GET":
        plan_id = path.rsplit("/", 1)[-1]
        result = get_schedule(plan_id)
        return (200 if result.get("ok") else 404), result

    if path == "/api/omid-pension/payout/preview" and method == "POST":
        result = payout_preview(body)
        code = 200 if result.get("ok") else (403 if result.get("blocked") else 400)
        return code, result

    if path == "/api/omid-pension/death" and method == "POST":
        result = record_death(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/omid-pension/proof-of-life":
        if method == "GET":
            result = get_proof_of_life(query)
            return (200 if result.get("ok") else 404), result
        if method == "POST":
            result = post_proof_of_life(body)
            return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
