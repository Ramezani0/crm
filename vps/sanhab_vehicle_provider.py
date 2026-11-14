"""Sanhab vehicle inquiry — BimeBazar partners live adapter (CoS option 2).

NOT official Central Insurance / Sanhab API.
UI/API label MUST stay: «استعلام از طریق بیمه‌بازار»
Source badge: BIMEBAZAR_PARTNER / بیمه‌بازار

Rules:
- Inputs: full 4-part plate + national ID
- Display ONLY fields present in the real partner response (no fake fixtures)
- Do NOT persist national ID / plate PII
- DEMO stub only when explicitly toggled (demo=true or SANHAB_VEHICLE_SOURCE=demo)
- On fail: clear error — never silent DEMO as live
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

try:
    from bimebazar_client import (
        bimebazar_config,
        login as bimebazar_login,
        map_plate_to_plk,
        plate_inquiry as bimebazar_plate_inquiry,
        _make_opener,
        _digits as bb_digits,
    )
except ImportError:  # pragma: no cover
    from vps.bimebazar_client import (  # type: ignore
        bimebazar_config,
        login as bimebazar_login,
        map_plate_to_plk,
        plate_inquiry as bimebazar_plate_inquiry,
        _make_opener,
        _digits as bb_digits,
    )

SOURCE_BIMEBAZAR = "BIMEBAZAR_PARTNER"
SOURCE_LABEL_BIMEBAZAR = "بیمه‌بازار"
VEHICLE_INQUIRY_LABEL_FA = "استعلام از طریق بیمه‌بازار"
FORBIDDEN_OFFICIAL_LABEL = "سنهاب رسمی بیمه مرکزی"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def vehicle_source_mode(body: dict | None = None) -> str:
    """live (default) | demo. DEMO only when explicitly toggled."""
    body = body if isinstance(body, dict) else {}
    if body.get("demo") is True or body.get("forceDemo") is True:
        return "demo"
    raw = (os.environ.get("SANHAB_VEHICLE_SOURCE") or "live").strip().lower()
    if raw in ("demo", "demo_stub", "stub"):
        return "demo"
    return "live"


def mask_national_id(nid: str | None) -> str | None:
    s = bb_digits(nid or "")
    if len(s) != 10:
        return None
    return f"{s[:3]}****{s[-3:]}"


def format_plate_display(plate: dict) -> str | None:
    p1 = bb_digits(plate.get("platePart1"))
    p2 = bb_digits(plate.get("platePart2"))
    iran = bb_digits(plate.get("plateIranCode"))
    letter = str(plate.get("plateLetter") or "").strip()
    if not (p1 and letter and p2 and iran):
        return None
    return f"{p1} | {letter} | {p2} | ایران {iran}"


def _pick_str(data: dict, *keys: str) -> str | None:
    for key in keys:
        if key not in data:
            continue
        val = data.get(key)
        if val is None or isinstance(val, (dict, list)):
            continue
        s = str(val).strip()
        if s and s.lower() not in ("none", "null", "undefined", "empty"):
            return s
    return None


def _pick_nested_str(data: dict, path: tuple[str, ...], *leaf_keys: str) -> str | None:
    cur: Any = data
    for part in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    if isinstance(cur, dict):
        return _pick_str(cur, *leaf_keys)
    if cur is None or isinstance(cur, (dict, list)):
        return None
    s = str(cur).strip()
    return s or None


def extract_partner_vehicle_fields(data: dict | None) -> dict:
    """Map partner plate-inquiry `data` → display fields.

    ONLY includes keys actually present with non-empty values.
    Never invents address/phone/insurer location fixtures.
    """
    data = data if isinstance(data, dict) else {}
    vehicle: dict[str, Any] = {}
    owner: dict[str, Any] = {}
    policy: dict[str, Any] = {}
    partner_meta: dict[str, Any] = {}

    for key, aliases in (
        ("make", ("car_brand", "brand", "make", "vehicle_brand", "carBrand")),
        ("model", ("car_model", "model", "vehicle_model", "carModel", "tip")),
        ("vin", ("vin", "VIN", "chassis", "chassis_number", "shasi")),
        ("year", ("car_production_year", "production_year", "year", "model_year")),
        ("usage", ("car_usage", "usage", "vehicle_usage")),
    ):
        val = _pick_str(data, *aliases)
        if val:
            vehicle[key] = val

    plk1 = _pick_str(data, "plk1")
    plk2 = _pick_str(data, "plk2")
    plk3 = _pick_str(data, "plk3")
    plk_srl = _pick_str(data, "plkSrl", "plk_srl")
    if plk1 or plk3 or plk_srl:
        vehicle["plateParts"] = {
            k: v
            for k, v in {
                "plk1": plk1,
                "plk2": plk2,
                "plk3": plk3,
                "plkSrl": plk_srl,
            }.items()
            if v
        }

    for key, aliases in (
        ("name", ("owner_name", "full_name", "name", "ownerName", "fullName", "person_name")),
        ("address", ("address", "owner_address", "postal_address", "ownerAddress", "addr")),
        ("phone", ("phone", "mobile", "owner_phone", "owner_mobile", "mobile_number", "tel")),
    ):
        val = _pick_str(data, *aliases)
        if val:
            owner[key] = val

    nested_name = _pick_nested_str(data, ("owner",), "name", "full_name", "owner_name")
    if nested_name and "name" not in owner:
        owner["name"] = nested_name
    nested_addr = _pick_nested_str(data, ("owner",), "address", "owner_address")
    if nested_addr and "address" not in owner:
        owner["address"] = nested_addr
    nested_phone = _pick_nested_str(data, ("owner",), "phone", "mobile", "tel")
    if nested_phone and "phone" not in owner:
        owner["phone"] = nested_phone

    for key, aliases in (
        ("number", ("policy_number", "policyNumber", "bime_number", "insurance_number")),
        (
            "insurerCompany",
            (
                "company_name",
                "insurer",
                "insurance_company",
                "companyName",
                "insurer_name",
                "insurerCompany",
                "bime_company",
            ),
        ),
        ("branch", ("branch", "branch_name", "branchName", "agency_name")),
        (
            "branchAddress",
            ("branch_address", "branchAddress", "agency_address", "insurer_location"),
        ),
        ("status", ("policy_status", "status", "coverage_status", "sanhab_status")),
        ("start", ("start_date", "begin_date", "policy_start", "from_date", "startDate")),
        ("end", ("end_date", "expire_date", "policy_end", "to_date", "endDate", "expiry")),
    ):
        val = _pick_str(data, *aliases)
        if val:
            policy[key] = val

    for key, aliases in (
        ("sbId", ("sb_id", "sbId")),
        ("sanhabSubmitStatus", ("sanhab_submit_response_status", "sanhabSubmitStatus")),
        ("inquiryType", ("inquiry_type", "inquiryType")),
        ("hasPlateChanged", ("has_plate_changed", "hasPlateChanged")),
        ("messageCode", ("message_code", "messageCode", "code")),
    ):
        val = _pick_str(data, *aliases)
        if val:
            partner_meta[key] = val

    available: list[str] = []
    for prefix, obj in (
        ("vehicle", vehicle),
        ("owner", owner),
        ("policy", policy),
        ("partner", partner_meta),
    ):
        for k in obj:
            available.append(f"{prefix}.{k}")

    return {
        "vehicle": vehicle or None,
        "owner": owner or None,
        "policy": policy or None,
        "partnerMeta": partner_meta or None,
        "availableFields": available,
    }


def _base_fail(
    *,
    error: str,
    code: str,
    lookup_status: str,
    user_message: str | None = None,
    extra: dict | None = None,
) -> dict:
    out = {
        "ok": False,
        "error": error,
        "code": code,
        "source": SOURCE_BIMEBAZAR,
        "sourceLabel": SOURCE_LABEL_BIMEBAZAR,
        "label": VEHICLE_INQUIRY_LABEL_FA,
        "demoStub": False,
        "lookupStatus": lookup_status,
        "userMessage": user_message or error,
        "persistedPii": False,
    }
    if extra:
        out.update(extra)
    return out


def vehicle_inquiry_bimebazar(body: dict) -> dict:
    """Live plate+nationalId inquiry via BimeBazar partners. No PII persistence."""
    plate = body.get("plate") if isinstance(body.get("plate"), dict) else {}
    if not plate:
        plate = {
            "platePart1": body.get("platePart1"),
            "plateLetter": body.get("plateLetter"),
            "platePart2": body.get("platePart2"),
            "plateIranCode": body.get("plateIranCode") or body.get("plateIran"),
        }
    try:
        plk = map_plate_to_plk(plate)
    except ValueError as exc:
        return _base_fail(
            error=str(exc),
            code="invalid_plate",
            lookup_status="incomplete_input",
            user_message=str(exc) or "پلاک کامل ۴ تکه لازم است",
        )

    national_id = bb_digits(body.get("nationalId") or body.get("national_id"))
    if len(national_id) != 10:
        return _base_fail(
            error="کد ملی نامعتبر است",
            code="invalid_national_id",
            lookup_status="incomplete_input",
            user_message="کد ملی باید ۱۰ رقم باشد",
        )

    cfg = bimebazar_config()
    if not cfg.get("configured"):
        return _base_fail(
            error="اتصال بیمه‌بازار پیکربندی نشده است",
            code="bimebazar_env_missing",
            lookup_status="provider_unavailable",
            user_message=(
                "اتصال بیمه‌بازار پیکربندی نشده — متغیرهای "
                "BIMEBAZAR_URL، BIMEBAZAR_USER، BIMEBAZAR_PASS روی api لازم است"
            ),
        )

    opener, jar = _make_opener()
    logged = bimebazar_login(opener, jar, cfg)
    if not logged.get("ok"):
        return _base_fail(
            error=logged.get("error") or "ورود به پرتال شرکا ناموفق بود",
            code="bimebazar_login_failed",
            lookup_status="provider_failure",
            user_message="ورود به پرتال شرکای بیمه‌بازار ناموفق بود — دوباره تلاش کنید",
        )

    inquiry = bimebazar_plate_inquiry(opener, cfg, logged["token"], plk, national_id)
    data = inquiry.get("data") if isinstance(inquiry.get("data"), dict) else {}
    extracted = extract_partner_vehicle_fields(data)
    sanhab_failed = bool(inquiry.get("sanhabFailed"))
    http_ok = bool(inquiry.get("ok"))
    query = {
        "plateDisplay": format_plate_display(plate),
        "nationalIdMasked": mask_national_id(national_id),
    }

    if sanhab_failed or not http_ok:
        status = "no_match" if sanhab_failed else "provider_failure"
        msg = (
            "استعلام از طریق بیمه‌بازار ناموفق بود (سنهاب شرکا)"
            if sanhab_failed
            else (inquiry.get("error") or "استعلام از طریق بیمه‌بازار ناموفق بود")
        )
        return {
            "ok": False,
            "error": msg,
            "code": inquiry.get("code")
            or ("sanhab_failed" if sanhab_failed else "plate_inquiry_failed"),
            "source": SOURCE_BIMEBAZAR,
            "sourceLabel": SOURCE_LABEL_BIMEBAZAR,
            "label": VEHICLE_INQUIRY_LABEL_FA,
            "demoStub": False,
            "lookupStatus": status,
            "userMessage": msg + " — دوباره تلاش کنید",
            "sanhabFailed": sanhab_failed,
            "query": query,
            "vehicle": extracted["vehicle"],
            "owner": extracted["owner"],
            "policy": extracted["policy"],
            "partnerMeta": extracted["partnerMeta"],
            "availableFields": extracted["availableFields"],
            "sourceTimestamp": iso_now(),
            "persistedPii": False,
        }

    owner = dict(extracted["owner"] or {})
    owner["matched"] = True
    owner["nationalIdMasked"] = mask_national_id(national_id)
    available = list(extracted["availableFields"])
    for key in ("owner.matched", "owner.nationalIdMasked"):
        if key not in available:
            available.append(key)

    return {
        "ok": True,
        "source": SOURCE_BIMEBAZAR,
        "sourceLabel": SOURCE_LABEL_BIMEBAZAR,
        "label": VEHICLE_INQUIRY_LABEL_FA,
        "demoStub": False,
        "lookupStatus": "matched",
        "userMessage": "استعلام از طریق بیمه‌بازار انجام شد",
        "sanhabFailed": False,
        "query": query,
        "vehicle": extracted["vehicle"],
        "owner": owner,
        "policy": extracted["policy"],
        "partnerMeta": extracted["partnerMeta"],
        "availableFields": available,
        "sourceTimestamp": iso_now(),
        "persistedPii": False,
        "inquiry": None,
    }


def public_vehicle_meta() -> dict:
    return {
        "defaultSource": vehicle_source_mode({}),
        "liveSource": SOURCE_BIMEBAZAR,
        "sourceLabel": SOURCE_LABEL_BIMEBAZAR,
        "label": VEHICLE_INQUIRY_LABEL_FA,
        "inputs": [
            "platePart1",
            "plateLetter",
            "platePart2",
            "plateIranCode",
            "nationalId",
        ],
        "persistsPii": False,
        "officialSanhab": False,
        "bimebazarConfigured": bool(bimebazar_config().get("configured")),
    }
