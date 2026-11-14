"""M7 Loyalty & Campaign — باشگاه مشتریان و جشنواره نمایندگان (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 008.
NEVER touches / wipes customers/policies/installments/M1–M6 tables.

Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
Accept future land links via: policy_number, policyholder_code, national_id.
Do NOT invent insurance_type outside locked Import enum.
Cite:
  ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
  MODULE_FORMULA_IMPORT_LOCKS_20260924.md
  KARAFARIN_CORE_MODULES_BRIEF_20260924.md §7
  research insurance-crm-modules-gemini-20260924.txt (~3693–3700)

Features (DEMO stubs):
  1) Portfolio points: early_pay vs due_date_jalali, new_policy, referral
  2) Cross-sell coupons: e.g. 20% fire when universal_life / omid_retirement purchase
  3) Agent festival dashboard: seasonal scores + leaderboard
"""
from __future__ import annotations

import copy
import hashlib
import re
import threading
from datetime import datetime, timezone
from typing import Any

MODULE = "loyalty"
MODULE_LABEL = "باشگاه / جشنواره"
PRODUCT_LABEL = MODULE_LABEL

# Earn reasons
EARN_REASONS = ("early_pay", "new_policy", "referral")

# Configurable DEMO rates (points)
DEMO_RATES: dict[str, int] = {
    "early_pay_per_day": 10,  # points per day paid early
    "early_pay_flat": 25,  # minimum if early but day-diff stub fails
    "new_policy": 100,
    "referral": 50,
}

# Locked Import enum values ONLY — do not invent
LOCKED_TRIGGER_TYPES = ("universal_life", "omid_retirement")
LOCKED_COUPON_TARGET = "fire"  # fire_family also locked; DEMO uses fire

# Cross-sell DEMO rule table
COUPON_RULES: list[dict[str, Any]] = [
    {
        "id": "rule-ul-omid-fire20",
        "triggerPolicyTypes": list(LOCKED_TRIGGER_TYPES),
        "couponInsuranceType": LOCKED_COUPON_TARGET,
        "discountPercent": 20,
        "label": "۲۰٪ تخفیف آتش‌سوزی منازل (خرید عمر اندوخته‌دار / امید)",
        "codePrefix": "FIRE20",
    },
]

DEFAULT_SEASON = "1404-autumn"

DEMO_DISCLAIMER = (
    "DEMO — اسکلت باشگاه/جشنواره؛ امتیاز قسط زودتر، خرید جدید، referral؛ "
    "کوپن متقاطع stub؛ لیدربورد فصلی نمایندگان. "
    "Excel HOLD · بدون wipe CRM · Eng-only این بچ."
)

ENG_EXTENSION_NOTE = (
    "Loyalty is Eng-module-only for this Excel batch "
    "(MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch = none in Excel). "
    "Future link keys: policy_number, policyholder_code, national_id. "
    "Do not invent locked insurance_type values."
)

HANDOFF_CITES = [
    "ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
    "MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
    "KARAFARIN_CORE_MODULES_BRIEF_20260924.md",
]

JALALI_RE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")

_STORE_LOCK = threading.RLock()
_POINT_LEDGER: list[dict] = []
_COUPONS: list[dict] = []
_CAMPAIGNS: list[dict] = []
_AGENT_SCORES: list[dict] = []
_NEXT_LEDGER_ID = 1
_NEXT_COUPON_ID = 1
_NEXT_CAMPAIGN_ID = 1
_NEXT_SCORE_ID = 1
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


def parse_jalali(s: str | None) -> tuple[int, int, int] | None:
    """Parse yyyy/mm/dd Jalali TEXT — no Gregorian conversion."""
    if not s:
        return None
    m = JALALI_RE.match(str(s).strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return y, mo, d


def jalali_day_ordinal(parts: tuple[int, int, int]) -> int:
    """DEMO stub ordinal — approximate calendar days (not full Jalali calendar)."""
    y, mo, d = parts
    return y * 365 + mo * 30 + d


def days_early(paid_jalali: str | None, due_jalali: str | None) -> int | None:
    """Positive if paid before due. None if unparseable. String yyyy/mm/dd sorts OK too."""
    p = parse_jalali(paid_jalali)
    d = parse_jalali(due_jalali)
    if p is None or d is None:
        return None
    delta = jalali_day_ordinal(d) - jalali_day_ordinal(p)
    return delta


def early_pay_points(
    paid_date_jalali: str | None,
    due_date_jalali: str | None,
    *,
    rates: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Compute DEMO early-pay points. Returns points + meta."""
    r = rates or DEMO_RATES
    delta = days_early(paid_date_jalali, due_date_jalali)
    if delta is None:
        return {
            "eligible": False,
            "daysEarly": None,
            "points": 0,
            "reason": "early_pay",
            "error": "due_date_jalali و paid_date_jalali باید yyyy/mm/dd باشند",
        }
    if delta <= 0:
        return {
            "eligible": False,
            "daysEarly": delta,
            "points": 0,
            "reason": "early_pay",
            "note": "پرداخت زودتر از موعد نیست",
        }
    per_day = int(r.get("early_pay_per_day", 10))
    flat_min = int(r.get("early_pay_flat", 25))
    pts = max(flat_min, delta * per_day)
    return {
        "eligible": True,
        "daysEarly": delta,
        "points": pts,
        "reason": "early_pay",
        "ratePerDay": per_day,
        "flatMin": flat_min,
    }


def coupon_code_for(policyholder_code: str, rule_id: str) -> str:
    material = f"{rule_id}|{policyholder_code}|{iso_now()}"
    hex6 = hashlib.sha256(material.encode("utf-8")).hexdigest()[:6].upper()
    prefix = next(
        (r["codePrefix"] for r in COUPON_RULES if r["id"] == rule_id),
        "CPN",
    )
    return f"{prefix}-{hex6}"


def find_coupon_rule(trigger_policy_type: str) -> dict | None:
    t = str(trigger_policy_type or "").strip()
    for rule in COUPON_RULES:
        if t in rule["triggerPolicyTypes"]:
            return rule
    return None


def reset_store_for_tests() -> None:
    global _NEXT_LEDGER_ID, _NEXT_COUPON_ID, _NEXT_CAMPAIGN_ID, _NEXT_SCORE_ID, _SEEDED
    with _STORE_LOCK:
        _POINT_LEDGER.clear()
        _COUPONS.clear()
        _CAMPAIGNS.clear()
        _AGENT_SCORES.clear()
        _NEXT_LEDGER_ID = 1
        _NEXT_COUPON_ID = 1
        _NEXT_CAMPAIGN_ID = 1
        _NEXT_SCORE_ID = 1
        _SEEDED = False
    ensure_seed()


def ensure_seed() -> None:
    global _SEEDED, _NEXT_LEDGER_ID, _NEXT_COUPON_ID, _NEXT_CAMPAIGN_ID, _NEXT_SCORE_ID
    with _STORE_LOCK:
        if _SEEDED:
            return
        # Seed campaign
        camp = {
            "id": _NEXT_CAMPAIGN_ID,
            "code": "FEST-1404-AUTUMN",
            "title": "جشنواره پاییز ۱۴۰۴ عمر و سرمایه‌گذاری",
            "season": DEFAULT_SEASON,
            "startsJalali": "1404/07/01",
            "endsJalali": "1404/09/30",
            "active": True,
            "demoStub": True,
            "createdAt": iso_now(),
        }
        _CAMPAIGNS.append(camp)
        _NEXT_CAMPAIGN_ID += 1

        # Seed agent scores for leaderboard
        seeds = [
            ("3045", "نمایندگی فاطمه فصیحی", 420),
            ("A-110", "بازاریاب آلفا", 310),
            ("A-220", "بازاریاب بتا", 275),
            ("A-330", "بازاریاب گاما", 180),
        ]
        for code, name, pts in seeds:
            _AGENT_SCORES.append(
                {
                    "id": _NEXT_SCORE_ID,
                    "agentCode": code,
                    "agentName": name,
                    "agencyCode": "3045",
                    "season": DEFAULT_SEASON,
                    "campaignCode": camp["code"],
                    "points": pts,
                    "demoStub": True,
                    "updatedAt": iso_now(),
                }
            )
            _NEXT_SCORE_ID += 1

        # Seed one ledger entry for DEMO policyholder
        _POINT_LEDGER.append(
            {
                "id": _NEXT_LEDGER_ID,
                "policyholderCode": "100200",
                "nationalId": None,
                "policyNumber": None,
                "reason": "new_policy",
                "points": DEMO_RATES["new_policy"],
                "meta": {"policyType": "universal_life", "seed": True},
                "demoStub": True,
                "createdAt": iso_now(),
            }
        )
        _NEXT_LEDGER_ID += 1
        _SEEDED = True


def _link_keys(body: dict) -> dict[str, Any]:
    return {
        "policyholderCode": body.get("policyholderCode") or body.get("policyholder_code"),
        "nationalId": body.get("nationalId") or body.get("national_id"),
        "policyNumber": body.get("policyNumber") or body.get("policy_number"),
    }


def balance(query: dict | None = None) -> dict:
    ensure_seed()
    ph = _qget(query, "policyholderCode") or _qget(query, "policyholder_code")
    if not ph:
        return {"ok": False, "error": "policyholderCode الزامی است"}
    with _STORE_LOCK:
        rows = [r for r in _POINT_LEDGER if str(r.get("policyholderCode")) == ph]
        total = sum(int(r.get("points") or 0) for r in rows)
    return {
        "ok": True,
        "policyholderCode": ph,
        "balance": total,
        "entries": len(rows),
        "rates": copy.deepcopy(DEMO_RATES),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def ledger(query: dict | None = None) -> dict:
    ensure_seed()
    ph = _qget(query, "policyholderCode") or _qget(query, "policyholder_code")
    if not ph:
        return {"ok": False, "error": "policyholderCode الزامی است"}
    with _STORE_LOCK:
        rows = [
            copy.deepcopy(r)
            for r in _POINT_LEDGER
            if str(r.get("policyholderCode")) == ph
        ]
    rows.sort(key=lambda x: x.get("id", 0), reverse=True)
    return {
        "ok": True,
        "policyholderCode": ph,
        "count": len(rows),
        "items": rows,
        "demoStub": True,
    }


def earn(body: dict) -> dict:
    ensure_seed()
    reason = str(body.get("reason") or "").strip()
    if reason not in EARN_REASONS:
        return {
            "ok": False,
            "error": f"reason نامعتبر؛ مجاز: {', '.join(EARN_REASONS)}",
        }
    links = _link_keys(body)
    ph = links["policyholderCode"]
    if not ph:
        return {"ok": False, "error": "policyholderCode الزامی است"}
    ph = str(ph).strip()

    points = 0
    meta: dict[str, Any] = {}

    if reason == "early_pay":
        paid = body.get("paidDateJalali") or body.get("paid_date_jalali")
        due = body.get("dueDateJalali") or body.get("due_date_jalali")
        calc = early_pay_points(
            str(paid) if paid else None,
            str(due) if due else None,
        )
        if not calc.get("eligible"):
            return {
                "ok": False,
                "error": calc.get("error") or calc.get("note") or "واجد شرایط امتیاز زودپرداخت نیست",
                "calc": calc,
            }
        points = int(calc["points"])
        meta = {
            "paidDateJalali": paid,
            "dueDateJalali": due,
            "daysEarly": calc["daysEarly"],
            "ratePerDay": calc.get("ratePerDay"),
        }
        installment_no = body.get("installmentNo") or body.get("installment_no")
        if installment_no is not None:
            meta["installmentNo"] = installment_no

    elif reason == "new_policy":
        points = int(DEMO_RATES["new_policy"])
        # Accept optional policy type but do not invent outside locked enum
        ptype = body.get("policyType") or body.get("insuranceType") or body.get("insurance_type")
        if ptype:
            meta["policyType"] = str(ptype).strip()
        if links["policyNumber"]:
            meta["policyNumber"] = links["policyNumber"]

    elif reason == "referral":
        points = int(DEMO_RATES["referral"])
        lead_ref = body.get("leadRef") or body.get("lead_ref") or body.get("referralCode")
        if lead_ref:
            meta["leadRef"] = str(lead_ref).strip()

    if points <= 0:
        return {"ok": False, "error": "امتیاز صفر — ثبت نشد"}

    with _STORE_LOCK:
        global _NEXT_LEDGER_ID
        entry = {
            "id": _NEXT_LEDGER_ID,
            "policyholderCode": ph,
            "nationalId": links["nationalId"],
            "policyNumber": links["policyNumber"],
            "reason": reason,
            "points": points,
            "meta": meta,
            "demoStub": True,
            "createdAt": iso_now(),
        }
        _POINT_LEDGER.append(entry)
        _NEXT_LEDGER_ID += 1
        out = copy.deepcopy(entry)
        bal = sum(
            int(r.get("points") or 0)
            for r in _POINT_LEDGER
            if str(r.get("policyholderCode")) == ph
        )

    return {
        "ok": True,
        "earned": True,
        "entry": out,
        "points": points,
        "balance": bal,
        "rates": copy.deepcopy(DEMO_RATES),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def issue_coupon(body: dict) -> dict:
    ensure_seed()
    trigger = str(
        body.get("triggerPolicyType")
        or body.get("trigger_policy_type")
        or body.get("policyType")
        or ""
    ).strip()
    links = _link_keys(body)
    ph = links["policyholderCode"]
    if not ph:
        return {"ok": False, "error": "policyholderCode الزامی است"}
    ph = str(ph).strip()
    if not trigger:
        return {"ok": False, "error": "triggerPolicyType الزامی است"}

    rule = find_coupon_rule(trigger)
    if rule is None:
        return {
            "ok": False,
            "error": (
                f"هیچ قاعده کوپنی برای triggerPolicyType={trigger} نیست؛ "
                f"مجاز DEMO: {', '.join(LOCKED_TRIGGER_TYPES)}"
            ),
            "lockedTriggers": list(LOCKED_TRIGGER_TYPES),
        }

    # Guard: do not invent insurance_type — coupon target must be locked enum value
    target = rule["couponInsuranceType"]
    code = coupon_code_for(ph, rule["id"])

    with _STORE_LOCK:
        global _NEXT_COUPON_ID
        # Idempotent-ish: same ph + rule + unused → return existing
        existing = next(
            (
                c
                for c in _COUPONS
                if c["policyholderCode"] == ph
                and c["ruleId"] == rule["id"]
                and c.get("status") == "issued"
            ),
            None,
        )
        if existing:
            return {
                "ok": True,
                "issued": False,
                "coupon": copy.deepcopy(existing),
                "rule": copy.deepcopy(rule),
                "demoStub": True,
                "note": "کوپن قبلی بازگردانی شد",
            }

        coupon = {
            "id": _NEXT_COUPON_ID,
            "code": code,
            "policyholderCode": ph,
            "nationalId": links["nationalId"],
            "policyNumber": links["policyNumber"],
            "ruleId": rule["id"],
            "triggerPolicyType": trigger,
            "couponInsuranceType": target,
            "discountPercent": rule["discountPercent"],
            "label": rule["label"],
            "status": "issued",
            "demoStub": True,
            "createdAt": iso_now(),
            "expiresJalali": body.get("expiresJalali") or "1405/01/01",
        }
        _COUPONS.append(coupon)
        _NEXT_COUPON_ID += 1
        out = copy.deepcopy(coupon)

    return {
        "ok": True,
        "issued": True,
        "coupon": out,
        "rule": copy.deepcopy(rule),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def list_coupons(query: dict | None = None) -> dict:
    ensure_seed()
    ph = _qget(query, "policyholderCode") or _qget(query, "policyholder_code")
    if not ph:
        return {"ok": False, "error": "policyholderCode الزامی است"}
    with _STORE_LOCK:
        rows = [
            copy.deepcopy(c)
            for c in _COUPONS
            if str(c.get("policyholderCode")) == ph
        ]
    rows.sort(key=lambda x: x.get("id", 0), reverse=True)
    return {
        "ok": True,
        "policyholderCode": ph,
        "count": len(rows),
        "items": rows,
        "rules": copy.deepcopy(COUPON_RULES),
        "demoStub": True,
    }


def festival(query: dict | None = None) -> dict:
    ensure_seed()
    season = _qget(query, "season") or DEFAULT_SEASON
    with _STORE_LOCK:
        camps = [
            copy.deepcopy(c)
            for c in _CAMPAIGNS
            if c.get("season") == season or season == "all"
        ]
        scores = [
            copy.deepcopy(s)
            for s in _AGENT_SCORES
            if s.get("season") == season
        ]
    scores.sort(key=lambda x: (-int(x.get("points") or 0), str(x.get("agentCode") or "")))
    leaderboard = []
    for i, s in enumerate(scores, start=1):
        row = copy.deepcopy(s)
        row["rank"] = i
        leaderboard.append(row)

    return {
        "ok": True,
        "season": season,
        "campaigns": camps,
        "leaderboard": leaderboard,
        "topPoints": leaderboard[0]["points"] if leaderboard else 0,
        "agentCount": len(leaderboard),
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def festival_score(body: dict) -> dict:
    ensure_seed()
    agent_code = str(body.get("agentCode") or body.get("agent_code") or "").strip()
    if not agent_code:
        return {"ok": False, "error": "agentCode الزامی است"}
    try:
        pts = int(body.get("points"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "points باید عدد صحیح باشد"}
    if pts < 0:
        return {"ok": False, "error": "points نمی‌تواند منفی باشد"}

    season = str(body.get("season") or DEFAULT_SEASON).strip() or DEFAULT_SEASON
    agent_name = body.get("agentName") or body.get("agent_name")
    agency_code = body.get("agencyCode") or body.get("agency_code") or "3045"
    campaign_code = body.get("campaignCode") or body.get("campaign_code")

    with _STORE_LOCK:
        global _NEXT_SCORE_ID
        existing = next(
            (
                s
                for s in _AGENT_SCORES
                if s["agentCode"] == agent_code and s.get("season") == season
            ),
            None,
        )
        if existing:
            # Additive score bump
            existing["points"] = int(existing.get("points") or 0) + pts
            if agent_name:
                existing["agentName"] = str(agent_name)
            if agency_code:
                existing["agencyCode"] = str(agency_code)
            if campaign_code:
                existing["campaignCode"] = str(campaign_code)
            existing["updatedAt"] = iso_now()
            out = copy.deepcopy(existing)
            created = False
        else:
            row = {
                "id": _NEXT_SCORE_ID,
                "agentCode": agent_code,
                "agentName": str(agent_name) if agent_name else agent_code,
                "agencyCode": str(agency_code),
                "season": season,
                "campaignCode": campaign_code,
                "points": pts,
                "demoStub": True,
                "updatedAt": iso_now(),
            }
            _AGENT_SCORES.append(row)
            _NEXT_SCORE_ID += 1
            out = copy.deepcopy(row)
            created = True

    # Rank after update
    fest = festival({"season": [season]})
    rank = next(
        (r["rank"] for r in fest["leaderboard"] if r["agentCode"] == agent_code),
        None,
    )

    return {
        "ok": True,
        "created": created,
        "score": out,
        "rank": rank,
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
            "earnReasons": list(EARN_REASONS),
            "rates": copy.deepcopy(DEMO_RATES),
            "couponRules": copy.deepcopy(COUPON_RULES),
            "lockedTriggerTypes": list(LOCKED_TRIGGER_TYPES),
            "lockedCouponTarget": LOCKED_COUPON_TARGET,
            "defaultSeason": DEFAULT_SEASON,
            "futureLinkKeys": [
                "policy_number",
                "policyholder_code",
                "national_id",
            ],
            "counts": {
                "ledger": len(_POINT_LEDGER),
                "coupons": len(_COUPONS),
                "campaigns": len(_CAMPAIGNS),
                "agentScores": len(_AGENT_SCORES),
            },
            "endpoints": [
                "GET /api/loyalty/meta",
                "GET /api/loyalty/balance?policyholderCode=",
                "POST /api/loyalty/earn",
                "GET /api/loyalty/ledger?policyholderCode=",
                "POST /api/loyalty/coupons/issue",
                "GET /api/loyalty/coupons?policyholderCode=",
                "GET /api/loyalty/festival",
                "POST /api/loyalty/festival/score",
            ],
        }


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
) -> tuple[int, dict]:
    """Route loyalty API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/loyalty/meta" and method == "GET":
        return 200, meta()

    if path == "/api/loyalty/balance" and method == "GET":
        result = balance(query)
        return (200 if result.get("ok") else 400), result

    if path == "/api/loyalty/earn" and method == "POST":
        result = earn(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/loyalty/ledger" and method == "GET":
        result = ledger(query)
        return (200 if result.get("ok") else 400), result

    if path == "/api/loyalty/coupons/issue" and method == "POST":
        result = issue_coupon(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/loyalty/coupons" and method == "GET":
        result = list_coupons(query)
        return (200 if result.get("ok") else 400), result

    if path == "/api/loyalty/festival" and method == "GET":
        return 200, festival(query)

    if path == "/api/loyalty/festival/score" and method == "POST":
        result = festival_score(body)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
