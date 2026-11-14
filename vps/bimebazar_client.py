"""BimeBazar partners client for premium-compare.

Credentials from env only: BIMEBAZAR_URL, BIMEBAZAR_USER, BIMEBAZAR_PASS.
Optional: BIMEBAZAR_LOGIN_BASE, BIMEBAZAR_API_BASE.
Never log or return secret values.

Plate map (UI → API) — assumption from partners session probe:
  platePart1 (۲ رقم راست پلاک) → plk1
  plateLetter (حرف)             → plk2  (۰-based index in PLATE_LETTERS; ب → "1")
  platePart2 (۳ رقم میانی)      → plk3
  plateIranCode (کد ایران)      → plkSrl

API surface (contract + live probe):
  POST {login}/api/v1/password-login/
  POST {api}/api/order/car-plate-inquiry/?step=start
  GET  {api}/thirdparty/api/offers/
  GET  {api}/carbody/api/offers/
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from typing import Any

# Must stay aligned with src/lib/premium-compare-mock.ts PLATE_LETTERS
PLATE_LETTERS = (
    "الف",
    "ب",
    "پ",
    "ت",
    "ث",
    "ج",
    "د",
    "ز",
    "س",
    "ش",
    "ص",
    "ط",
    "ع",
    "ف",
    "ق",
    "ک",
    "گ",
    "ل",
    "م",
    "ن",
    "ی",
)

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

DEFAULT_LOGIN_BASE = "https://shoraka.net"
DEFAULT_API_BASE = "https://iframe.shoraka.net"

ERR_ENV = "اتصال بیمه‌بازار پیکربندی نشده است"
ERR_LOGIN = "ورود به پرتال شرکا ناموفق بود"
ERR_SANHAB = "استعلام سنهاب ناموفق بود"
ERR_EMPTY = "پیشنهادی از شرکت‌های بیمه یافت نشد"
ERR_NETWORK = "ارتباط با بیمه‌بازار برقرار نشد"
ERR_INVALID = "ورودی استعلام نامعتبر است"


def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or "").translate(PERSIAN_DIGITS))


def bimebazar_config() -> dict:
    url = (os.environ.get("BIMEBAZAR_URL") or "").strip()
    user = (os.environ.get("BIMEBAZAR_USER") or "").strip()
    password = (os.environ.get("BIMEBAZAR_PASS") or "").strip()
    login_base = (os.environ.get("BIMEBAZAR_LOGIN_BASE") or DEFAULT_LOGIN_BASE).rstrip("/")
    api_base = (os.environ.get("BIMEBAZAR_API_BASE") or DEFAULT_API_BASE).rstrip("/")
    configured = bool(url and user and password)
    return {
        "ok": True,
        "configured": configured,
        "portalUrl": url or None,
        "loginBase": login_base,
        "apiBase": api_base,
        "error": None if configured else ERR_ENV,
        "_user": user,
        "_password": password,
    }


def bimebazar_status_public() -> dict:
    cfg = bimebazar_config()
    return {k: v for k, v in cfg.items() if not str(k).startswith("_")}


def map_plate_to_plk(plate: dict) -> dict[str, str]:
    """Map UI split plate → BimeBazar plk* fields.

    Assumption: plk2 is the 0-based index of plateLetter in PLATE_LETTERS
    (ب → \"1\"), matching partners session storage — not the Persian glyph.
    """
    part1 = _digits(plate.get("platePart1"))
    part2 = _digits(plate.get("platePart2"))
    iran = _digits(plate.get("plateIranCode") or plate.get("plateIranCode"))
    letter = str(plate.get("plateLetter") or "").strip()
    if letter not in PLATE_LETTERS:
        raise ValueError("حرف پلاک نامعتبر است")
    if not (
        re.fullmatch(r"\d{2}", part1)
        and re.fullmatch(r"\d{3}", part2)
        and re.fullmatch(r"\d{2}", iran)
    ):
        raise ValueError("پلاک کامل نیست")
    return {
        "plk1": part1,
        "plk2": str(PLATE_LETTERS.index(letter)),
        "plk3": part2,
        "plkSrl": iran,
    }


def _make_opener() -> tuple[Any, CookieJar]:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    return opener, jar


def _auth_token(jar: CookieJar) -> str:
    for cookie in jar:
        if cookie.name in ("auth-token", "auth_token", "token"):
            return cookie.value or ""
    return ""


def _request_json(
    opener: Any,
    url: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict | None = None,
    timeout: int = 45,
) -> dict:
    hdrs = {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "FasihiCRM-PremiumCompare/1.0",
        **(headers or {}),
    }
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            parsed: Any = {}
            if raw:
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = {"_raw": raw[:200]}
            return {
                "ok": 200 <= getattr(resp, "status", 200) < 300,
                "status": getattr(resp, "status", 200),
                "result": parsed,
            }
    except urllib.error.HTTPError as exc:
        raw = ""
        try:
            raw = exc.read().decode("utf-8", "replace")
        except Exception:
            raw = ""
        parsed: Any = {}
        if raw:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = {"message": raw[:200]}
        return {"ok": False, "status": exc.code, "result": parsed, "error": ERR_NETWORK}
    except Exception:
        return {"ok": False, "status": 0, "result": {}, "error": ERR_NETWORK}


def login(opener: Any, jar: CookieJar, cfg: dict) -> dict:
    url = f"{cfg['loginBase']}/api/v1/password-login/"
    sent = _request_json(
        opener,
        url,
        method="POST",
        payload={"username": cfg["_user"], "password": cfg["_password"]},
        headers={"Origin": cfg["loginBase"], "Referer": f"{cfg['loginBase']}/login"},
    )
    token = _auth_token(jar)
    result = sent.get("result") if isinstance(sent.get("result"), dict) else {}
    success = bool(token) and (bool(sent.get("ok")) or bool(result.get("success")))
    if not success:
        return {"ok": False, "error": ERR_LOGIN, "code": "bimebazar_login_failed"}
    return {"ok": True, "token": token}


def plate_inquiry(opener: Any, cfg: dict, token: str, plk: dict, national_id: str) -> dict:
    url = f"{cfg['apiBase']}/api/order/car-plate-inquiry/?step=start"
    payload = {
        **plk,
        "national_id": _digits(national_id),
        "inquiry_type": "sanhab",
    }
    sent = _request_json(
        opener,
        url,
        method="POST",
        payload=payload,
        headers={
            "Authorization": f"Token {token}",
            "Origin": cfg["apiBase"],
            "Referer": f"{cfg['apiBase']}/",
        },
    )
    result = sent.get("result") if isinstance(sent.get("result"), dict) else {}
    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    code = str(result.get("message_code") or result.get("code") or "")
    sanhab_fail = (
        code in ("sb_query_failed", "sanhab_failed", "sanhab_fail")
        or str(data.get("sanhab_submit_response_status") or "").lower()
        in ("fail", "failed", "error")
        or (not sent.get("ok") and sent.get("status") in (400, 422))
    )
    return {
        "ok": bool(sent.get("ok")),
        "status": sent.get("status"),
        "sanhabFailed": sanhab_fail,
        "data": data,
        "result": result,
        "error": None if sent.get("ok") else (ERR_SANHAB if sanhab_fail else ERR_INVALID),
        "code": "sanhab_failed" if sanhab_fail else (None if sent.get("ok") else "plate_inquiry_failed"),
    }


def _offer_company(item: dict) -> str:
    for key in ("company_name", "companyName", "company", "name", "title", "insurer_name"):
        val = item.get(key)
        if val:
            return str(val).strip()
    brand = item.get("company_brand") or item.get("brand")
    if isinstance(brand, dict) and brand.get("name"):
        return str(brand["name"]).strip()
    return ""


def _offer_number(item: dict, *keys: str) -> int | None:
    for key in keys:
        if key not in item or item.get(key) is None:
            continue
        try:
            raw = str(item.get(key)).translate(PERSIAN_DIGITS).replace(",", "")
            return int(round(float(raw)))
        except (TypeError, ValueError):
            continue
    return None


def normalize_offers(raw: Any, *, line: str) -> list[dict]:
    """Flatten partner offers → compare rows. Keep ALL companies (no truncate)."""
    offers: Any = None
    if isinstance(raw, dict):
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        if isinstance(data, dict):
            offers = data.get("offers")
        if offers is None:
            offers = raw.get("offers")
    elif isinstance(raw, list):
        offers = raw
    if not isinstance(offers, list):
        return []

    rows: list[dict] = []
    for i, item in enumerate(offers):
        if not isinstance(item, dict):
            continue
        name = _offer_company(item)
        if not name:
            continue
        tariff = _offer_number(item, "tariff", "price", "premium", "final_price", "amount")
        base = _offer_number(item, "base_tariff", "baseTariff", "base_price")
        third = tariff if line == "third_party" else None
        body = tariff if line == "body" else None
        discounts = item.get("discounts")
        if discounts is not None and not isinstance(discounts, (dict, list, str, int, float)):
            discounts = str(discounts)
        rows.append(
            {
                "id": str(item.get("id") or item.get("uid") or f"{line}-{i}"),
                "name": name,
                "thirdParty": third,
                "body": body,
                "tariff": tariff,
                "baseTariff": base,
                "discounts": discounts,
                "solvencyLevel": item.get("solvency_level") or item.get("solvencyLevel"),
                "line": line,
            }
        )
    return rows


def fetch_offers(
    opener: Any,
    cfg: dict,
    token: str,
    *,
    line: str,
    plk: dict,
    national_id: str,
    inquiry: dict,
    financial_cover: int | None,
    extras: dict | None = None,
) -> dict:
    path = "/thirdparty/api/offers/" if line == "third_party" else "/carbody/api/offers/"
    data = inquiry.get("data") if isinstance(inquiry.get("data"), dict) else {}
    params: dict[str, Any] = {
        **plk,
        "national_id": _digits(national_id),
        "inquiry_type": data.get("inquiry_type") or "regular",
        "sb_id": data.get("sb_id") or "empty",
        "sanhab_submit_response_status": data.get("sanhab_submit_response_status") or "fail",
        "has_plate_changed": data.get("has_plate_changed") or "no_info_without_sb",
    }
    if financial_cover:
        params["financial_coverage"] = int(financial_cover)
    if extras:
        for key, val in extras.items():
            if val is not None and val != "":
                params[key] = val
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{cfg['apiBase']}{path}?{qs}"
    sent = _request_json(
        opener,
        url,
        method="GET",
        headers={
            "Authorization": f"Token {token}",
            "Origin": cfg["apiBase"],
            "Referer": f"{cfg['apiBase']}/",
        },
    )
    result = sent.get("result")
    rows = normalize_offers(result, line=line) if sent.get("ok") else []
    return {
        "ok": bool(sent.get("ok")),
        "status": sent.get("status"),
        "offers": rows,
        "raw": result,
        "error": None if sent.get("ok") else ERR_NETWORK,
    }


def quote_premium(body: dict) -> dict:
    """Login → plate inquiry → offers. Secrets never appear in the return value."""
    cfg = bimebazar_config()
    if not cfg["configured"]:
        return {"ok": False, "error": ERR_ENV, "code": "bimebazar_env_missing", "offers": []}

    line = str(body.get("line") or "third_party").strip()
    if line not in ("third_party", "body"):
        return {"ok": False, "error": ERR_INVALID, "code": "invalid_line", "offers": []}

    plate = body.get("plate") if isinstance(body.get("plate"), dict) else {}
    try:
        plk = map_plate_to_plk(plate)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "code": "invalid_plate", "offers": []}

    national_id = _digits(body.get("nationalId") or body.get("national_id"))
    if len(national_id) != 10:
        return {"ok": False, "error": "کد ملی نامعتبر است", "code": "invalid_national_id", "offers": []}

    cover = body.get("financialCover")
    if cover is None:
        cover = body.get("financial_cover")
    try:
        cover_i = int(cover) if cover is not None and str(cover) != "" else None
    except (TypeError, ValueError):
        cover_i = None

    extras = {
        "vehicle_type": body.get("vehicleType") or body.get("vehicle_type") or "car",
        "car_usage": body.get("usage") or body.get("car_usage") or "passenger",
        "car_production_year": _digits(body.get("year")) or None,
    }

    opener, jar = _make_opener()
    logged = login(opener, jar, cfg)
    if not logged.get("ok"):
        return {
            "ok": False,
            "error": logged.get("error") or ERR_LOGIN,
            "code": "bimebazar_login_failed",
            "offers": [],
        }

    token = logged["token"]
    inquiry = plate_inquiry(opener, cfg, token, plk, national_id)
    # Sanhab often fails in probe — still attempt offers with regular/empty sb.
    fetched = fetch_offers(
        opener,
        cfg,
        token,
        line=line,
        plk=plk,
        national_id=national_id,
        inquiry=inquiry,
        financial_cover=cover_i,
        extras=extras,
    )
    offers = fetched.get("offers") or []

    if not offers:
        if inquiry.get("sanhabFailed"):
            return {
                "ok": False,
                "error": ERR_SANHAB,
                "code": "sanhab_failed",
                "offers": [],
                "sanhabFailed": True,
                "mode": "live",
            }
        if not fetched.get("ok"):
            return {
                "ok": False,
                "error": fetched.get("error") or ERR_NETWORK,
                "code": "bimebazar_offers_failed",
                "offers": [],
                "mode": "live",
            }
        return {
            "ok": False,
            "error": ERR_EMPTY,
            "code": "offers_empty",
            "offers": [],
            "sanhabFailed": bool(inquiry.get("sanhabFailed")),
            "mode": "live",
        }

    return {
        "ok": True,
        "mode": "live",
        "line": line,
        "offers": offers,
        "count": len(offers),
        "sanhabFailed": bool(inquiry.get("sanhabFailed")),
        "plate": plk,
    }
