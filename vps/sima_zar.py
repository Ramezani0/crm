"""M2 سیما زر — gold savings / شمش طلا بورس کالا.

Stdlib-friendly in-memory store + optional SQL migration.
NEVER touches customers/policies/installments tables.

Live rate: tgju IME certificate gold bars (×10 → ریال/گرم) via public JSON
  SIMA_ZAR_RATE_SOURCE=tgju (default) · SIMA_ZAR_RATE_URL · SIMA_ZAR_RATE_KEY
  Primary key: ime_certificate_gold_bars (0.1g cert → ×10); fallback: geram24
On live fail: keep MANUAL/env rate + clear error — never silent DEMO_STUB as primary.
"""
from __future__ import annotations

import copy
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext
from typing import Any

getcontext().prec = 28

# --- Constants ---------------------------------------------------------------
DEFAULT_SYMBOL = "GOB1CD0001"
# Fallback only when live+manual unavailable — never presented as silent live.
DEFAULT_RATE_RIAL_PER_GRAM = Decimal("35000000")
FEE_ENTRY_PCT = Decimal("1")   # صدور / واریز دارایی
FEE_EXIT_PCT = Decimal("2")    # ابطال / بازخرید
MG_PER_GRAM = Decimal("1000")
LOAN_BLOCKED = True
LOAN_BLOCK_REASON_FA = "وام روی این طرح مجاز نیست"

# Live tgju — IME certificate gold bars → ریال/گرم (×10). Public JSON, no secrets.
DEFAULT_RATE_SOURCE = "tgju"
DEFAULT_TGJU_URL = "https://call1.tgju.org/ajax.json"
# Primary: گواهی سپرده شمش بورس کالا (CD1G0B0001 / 995) — each cert = 0.1g → ×10
DEFAULT_TGJU_KEY = "ime_certificate_gold_bars"
TGJU_FALLBACK_KEY = "geram24"  # market backup only when primary empty/missing
IME_CERT_KEYS = frozenset({"ime_certificate_gold_bars"})
CERT_TO_GRAM_FACTOR = Decimal("10")  # 0.1g per certificate
DEFAULT_TGJU_TIMEOUT_SEC = 8
DEFAULT_TGJU_CACHE_SEC = 60
TGJU_USER_AGENT = "FasihiSimaZar/1.0 (+agency; rate-sync)"
SOURCE_LABEL_TGJU = "نرخ طلای ۲۴ عیار (معادل گرم) — گواهی سپرده شمش بورس کالا"
SOURCE_LABEL_TGJU_FALLBACK = "نرخ طلای ۲۴ عیار — بازار (پشتیبان)"
SOURCE_ID_TGJU = "tgju"
SOURCE_ID_TGJU_IME = "tgju_ime"
ERR_LIVE_FAIL = "دریافت نرخ زنده از tgju ناموفق بود — نرخ دستی/قبلی حفظ شد"
ERR_LIVE_PARSE = "پاسخ tgju قابل خواندن نبود — نرخ دستی/قبلی حفظ شد"
ERR_LIVE_EMPTY = "نرخ طلای ۲۴ عیار در پاسخ tgju یافت نشد — نرخ دستی/قبلی حفظ شد"

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

LEDGER_DEPOSIT = "deposit"
LEDGER_FEE_ENTRY = "fee_entry"
LEDGER_WITHDRAW = "withdraw"
LEDGER_FEE_EXIT = "fee_exit"
LEDGER_KINDS = (LEDGER_DEPOSIT, LEDGER_FEE_ENTRY, LEDGER_WITHDRAW, LEDGER_FEE_EXIT)

_STORE_LOCK = threading.RLock()
_RATE: dict[str, Any] = {}
_POSITIONS: list[dict] = []
_LEDGER: list[dict] = []
_NEXT_POS_ID = 1
_NEXT_LEDGER_ID = 1
_SEEDED = False
_LIVE_CACHE: dict[str, Any] = {"at": 0.0, "payload": None}


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


def _q_mg(value: Decimal) -> Decimal:
    """Quantize milligrams to 3 decimal places (µg precision)."""
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _q_rial(value: Decimal) -> int:
    """Nearest rial (int)."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def grams_to_milligrams(grams: Any) -> Decimal:
    g = _dec(grams, Decimal("0")) or Decimal("0")
    return _q_mg(g * MG_PER_GRAM)


def milligrams_to_grams(mg: Any) -> Decimal:
    m = _dec(mg, Decimal("0")) or Decimal("0")
    return (m / MG_PER_GRAM).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def reset_store_for_tests() -> None:
    """Clear in-memory store (unit tests only)."""
    global _RATE, _POSITIONS, _LEDGER, _NEXT_POS_ID, _NEXT_LEDGER_ID, _SEEDED, _LIVE_CACHE
    with _STORE_LOCK:
        _RATE = {}
        _POSITIONS = []
        _LEDGER = []
        _NEXT_POS_ID = 1
        _NEXT_LEDGER_ID = 1
        _SEEDED = False
        _LIVE_CACHE = {"at": 0.0, "payload": None}


def _env_rate() -> Decimal | None:
    """Optional env seed. None if unset — live/manual preferred over silent stub."""
    raw = (os.environ.get("SIMA_ZAR_RATE_RIAL_PER_GRAM") or "").strip()
    if raw:
        d = _dec(raw)
        if d is not None and d > 0:
            return d
    return None


def _env_symbol() -> str:
    return (os.environ.get("SIMA_ZAR_SYMBOL") or DEFAULT_SYMBOL).strip() or DEFAULT_SYMBOL


def _env_rate_source() -> str:
    raw = (os.environ.get("SIMA_ZAR_RATE_SOURCE") or DEFAULT_RATE_SOURCE).strip().lower()
    if raw in ("tgju", "live", "manual", "demo", "demo_stub"):
        if raw == "live":
            return "tgju"
        if raw == "demo_stub":
            return "demo"
        return raw
    return DEFAULT_RATE_SOURCE


def _env_tgju_url() -> str:
    return (os.environ.get("SIMA_ZAR_RATE_URL") or DEFAULT_TGJU_URL).strip() or DEFAULT_TGJU_URL


def _env_tgju_key() -> str:
    return (os.environ.get("SIMA_ZAR_RATE_KEY") or DEFAULT_TGJU_KEY).strip() or DEFAULT_TGJU_KEY


def _env_timeout_sec() -> float:
    raw = (os.environ.get("SIMA_ZAR_RATE_TIMEOUT_SEC") or "").strip()
    try:
        v = float(raw) if raw else DEFAULT_TGJU_TIMEOUT_SEC
    except ValueError:
        v = DEFAULT_TGJU_TIMEOUT_SEC
    return max(2.0, min(30.0, v))


def _env_cache_sec() -> float:
    raw = (os.environ.get("SIMA_ZAR_RATE_CACHE_SEC") or "").strip()
    try:
        v = float(raw) if raw else DEFAULT_TGJU_CACHE_SEC
    except ValueError:
        v = DEFAULT_TGJU_CACHE_SEC
    return max(0.0, min(600.0, v))


def _parse_rial_price(raw: Any) -> Decimal | None:
    """Parse tgju price strings like '316,875,000' or Persian digits → Decimal rial."""
    if raw is None:
        return None
    if isinstance(raw, (int, float, Decimal)):
        d = _dec(raw)
        return d if d is not None and d > 0 else None
    text = str(raw).translate(PERSIAN_DIGITS).strip()
    text = text.replace(",", "").replace("٫", "").replace(" ", "")
    text = re.sub(r"[^0-9.]", "", text)
    if not text:
        return None
    d = _dec(text)
    if d is None or d <= 0:
        return None
    return d


def _is_ime_cert_key(key: str) -> bool:
    return (key or "").strip() in IME_CERT_KEYS


def _extract_current_node(data: dict, key: str) -> tuple[dict | None, Decimal | None]:
    """Return (node, parsed_p) for current.<key>.p; (None, None) if missing/bad."""
    if not isinstance(data, dict):
        return None, None
    current = data.get("current") if isinstance(data.get("current"), dict) else data
    if not isinstance(current, dict):
        return None, None
    node = current.get(key)
    if not isinstance(node, dict):
        return None, None
    price = _parse_rial_price(node.get("p"))
    return node, price


def _rial_per_gram_from_node(key: str, raw_price: Decimal) -> Decimal:
    """IME cert quotes 0.1g → ×10 for ریال/گرم; market keys already per-gram."""
    if _is_ime_cert_key(key):
        return raw_price * CERT_TO_GRAM_FACTOR
    return raw_price


def fetch_tgju_live(*, force: bool = False) -> dict:
    """Server-side fetch of طلای ۲۴ عیار (معادل گرم) from tgju public JSON.

    Preferred path (PO lock):
      current.ime_certificate_gold_bars.p * 10  → ریال/گرم
      (گواهی سپرده شمش بورس کالا / CD1G0B0001 / 995 — each cert = 0.1g)

    Fallback ONLY when primary empty/missing:
      current.geram24.p  with label «بازار (پشتیبان)»

    Sample shape (ajax.json):
      {"current": {
         "ime_certificate_gold_bars": {"p": "31,638,990", "ts": "..."},
         "geram24": {"p": "316,875,000", "ts": "..."}
      }}
    """
    global _LIVE_CACHE
    cache_sec = _env_cache_sec()
    now = time.time()
    with _STORE_LOCK:
        cached = _LIVE_CACHE.get("payload")
        cached_at = float(_LIVE_CACHE.get("at") or 0)
    if (
        not force
        and cache_sec > 0
        and cached
        and cached.get("ok")
        and (now - cached_at) < cache_sec
    ):
        out = copy.deepcopy(cached)
        out["cached"] = True
        return out

    url = _env_tgju_url()
    primary_key = _env_tgju_key()
    timeout = _env_timeout_sec()
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": TGJU_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        data = json.loads(raw.decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": ERR_LIVE_FAIL, "code": f"http_{exc.code}", "live": False}
    except Exception:
        return {"ok": False, "error": ERR_LIVE_FAIL, "code": "network", "live": False}

    if not isinstance(data, dict):
        return {"ok": False, "error": ERR_LIVE_PARSE, "code": "parse", "live": False}

    used_key = primary_key
    used_fallback = False
    node, raw_price = _extract_current_node(data, primary_key)

    # Fallback to geram24 only when primary key empty/missing (not on network fail).
    if (node is None or raw_price is None) and primary_key != TGJU_FALLBACK_KEY:
        fb_node, fb_price = _extract_current_node(data, TGJU_FALLBACK_KEY)
        if fb_node is not None and fb_price is not None:
            node, raw_price = fb_node, fb_price
            used_key = TGJU_FALLBACK_KEY
            used_fallback = True

    if node is None:
        return {"ok": False, "error": ERR_LIVE_EMPTY, "code": "missing_key", "live": False}
    if raw_price is None:
        return {"ok": False, "error": ERR_LIVE_PARSE, "code": "bad_price", "live": False}

    price = _rial_per_gram_from_node(used_key, raw_price)

    ts = str(node.get("ts") or "").strip() or iso_now()
    # Normalize space timestamp → ISO-ish with Z if naive
    updated_at = ts.replace(" ", "T")
    if updated_at and "T" in updated_at and not updated_at.endswith("Z") and "+" not in updated_at:
        updated_at = updated_at + "Z"

    if used_fallback:
        source_label = SOURCE_LABEL_TGJU_FALLBACK
        source_id = SOURCE_ID_TGJU
        sub_source = TGJU_FALLBACK_KEY
    elif _is_ime_cert_key(used_key):
        source_label = SOURCE_LABEL_TGJU
        source_id = SOURCE_ID_TGJU_IME
        sub_source = used_key
    else:
        # Env override to a non-IME key (still live tgju, no silent DEMO).
        source_label = SOURCE_LABEL_TGJU if used_key == DEFAULT_TGJU_KEY else f"tgju · {used_key}"
        source_id = SOURCE_ID_TGJU
        sub_source = used_key

    payload = {
        "ok": True,
        "live": True,
        "rateRialPerGram": float(price),
        "rialPerGram": float(price),
        "rialPerGramStr": str(price),
        "rawPrice": float(raw_price),
        "rawPriceStr": str(raw_price),
        "gramFactor": float(CERT_TO_GRAM_FACTOR) if _is_ime_cert_key(used_key) else 1.0,
        "source": source_id,
        "sourceLabel": source_label,
        "tgjuSubSource": sub_source,
        "fallback": used_fallback,
        "updatedAt": updated_at,
        "asOf": updated_at,
        "tgjuKey": used_key,
        "tgjuUrlHost": urlparse(url).netloc,
        "cached": False,
    }
    with _STORE_LOCK:
        _LIVE_CACHE = {"at": now, "payload": copy.deepcopy(payload)}
    return payload


def _ensure_seeded() -> None:
    global _SEEDED, _RATE
    with _STORE_LOCK:
        if _SEEDED and _RATE:
            return
        if not _RATE:
            env_rate = _env_rate()
            mode = _env_rate_source()
            if env_rate is not None:
                source = "ENV"
                notes = "Seed from SIMA_ZAR_RATE_RIAL_PER_GRAM (fallback until live/manual)."
                rial = env_rate
            elif mode == "demo":
                source = "DEMO_STUB"
                notes = "DEMO stub only — set SIMA_ZAR_RATE_SOURCE=tgju for live."
                rial = DEFAULT_RATE_RIAL_PER_GRAM
            else:
                # Live primary: seed placeholder labeled clearly; GET will refresh.
                source = "PENDING_LIVE"
                notes = "Awaiting tgju live rate (or PUT manual)."
                rial = DEFAULT_RATE_RIAL_PER_GRAM
            _RATE = {
                "symbol": _env_symbol(),
                "rialPerGram": str(rial),
                "source": source,
                "asOf": iso_now(),
                "notes": notes,
                "loanBlocked": True,
                "feeEntryPct": float(FEE_ENTRY_PCT),
                "feeExitPct": float(FEE_EXIT_PCT),
            }
        _SEEDED = True


def _rate_response(
    *,
    live: bool = False,
    configured: bool = False,
    error: str | None = None,
    skip_live_refresh: bool = False,
) -> dict:
    """Build public rate payload from store (after optional live update)."""
    with _STORE_LOCK:
        r = copy.deepcopy(_RATE)
    rial = _dec(r.get("rialPerGram"), DEFAULT_RATE_RIAL_PER_GRAM) or DEFAULT_RATE_RIAL_PER_GRAM
    source = str(r.get("source") or "PENDING_LIVE")
    demo_stub = source.upper() in ("DEMO_STUB", "DEMO")
    pending = source.upper() in ("PENDING_LIVE",)
    as_of = r.get("asOf") or iso_now()
    source_label = SOURCE_LABEL_TGJU if source in ("tgju", "tgju_ime") else source
    if source == "MANUAL":
        source_label = "دستی (MANUAL)"
    elif source == "ENV":
        source_label = "env · SIMA_ZAR_RATE_RIAL_PER_GRAM"
    elif demo_stub:
        source_label = "DEMO_STUB (نمونه — زنده نیست)"
    elif pending:
        source_label = "در انتظار نرخ زنده"
    # Prefer store-held label from last live fetch (IME vs market fallback).
    stored_label = str(r.get("sourceLabel") or "").strip()
    if stored_label and source in ("tgju", "tgju_ime"):
        source_label = stored_label

    has_usable = (not demo_stub and not pending) or live
    # Still return a number for fee math, but flag clearly when stub/pending.
    out = {
        "ok": True,
        "symbol": r.get("symbol") or DEFAULT_SYMBOL,
        "rialPerGram": float(rial),
        "rialPerGramStr": str(rial),
        "rateRialPerGram": float(rial),
        "source": source,
        "sourceLabel": source_label,
        "asOf": as_of,
        "updatedAt": as_of,
        "notes": r.get("notes") or "",
        "loanBlocked": True,
        "feeEntryPct": float(FEE_ENTRY_PCT),
        "feeExitPct": float(FEE_EXIT_PCT),
        "demoStub": demo_stub,
        "live": live,
        "configured": configured,
        "error": error,
        "primaryLive": configured and not skip_live_refresh,
        "disclaimer": (
            SOURCE_LABEL_TGJU + " — نرخ زنده."
            if live
            else (
                error
                or (
                    "DEMO_STUB — نرخ نمونه؛ برای زنده SIMA_ZAR_RATE_SOURCE=tgju."
                    if demo_stub
                    else "نرخ دستی/env — زنده نیست."
                    if source in ("MANUAL", "ENV")
                    else "نرخ در انتظار بروزرسانی زنده."
                )
            )
        ),
        "usableAsPrimary": bool(has_usable or (source in ("MANUAL", "ENV"))),
    }
    return out


def get_rate(*, force_refresh: bool = False) -> dict:
    """GET rate — prefer live tgju when SIMA_ZAR_RATE_SOURCE=tgju (default).

    On live fail: keep MANUAL/ENV/store rate + clear error. Never silently
    promote DEMO_STUB as if it were live.
    """
    _ensure_seeded()
    mode = _env_rate_source()
    configured = mode == "tgju"

    if mode == "demo":
        with _STORE_LOCK:
            if (_RATE.get("source") or "") != "DEMO_STUB":
                # explicit demo mode only
                pass
        return _rate_response(live=False, configured=False, error=None, skip_live_refresh=True)

    if mode == "manual":
        return _rate_response(live=False, configured=False, error=None, skip_live_refresh=True)

    # mode == tgju (default)
    live = fetch_tgju_live(force=force_refresh)
    if live.get("ok"):
        live_source = str(live.get("source") or SOURCE_ID_TGJU_IME)
        live_label = str(live.get("sourceLabel") or SOURCE_LABEL_TGJU)
        with _STORE_LOCK:
            _RATE["rialPerGram"] = live["rialPerGramStr"]
            _RATE["source"] = live_source
            _RATE["sourceLabel"] = live_label
            _RATE["tgjuSubSource"] = live.get("tgjuSubSource") or live.get("tgjuKey")
            _RATE["asOf"] = live.get("updatedAt") or iso_now()
            _RATE["notes"] = live_label + " (ریال/گرم)"
            _RATE["loanBlocked"] = True
        out = _rate_response(live=True, configured=True, error=None)
        out["source"] = live_source
        out["sourceLabel"] = live_label
        out["tgjuSubSource"] = live.get("tgjuSubSource") or live.get("tgjuKey")
        out["tgjuKey"] = live.get("tgjuKey")
        out["fallback"] = bool(live.get("fallback"))
        out["gramFactor"] = live.get("gramFactor")
        out["disclaimer"] = live_label + " — نرخ زنده."
        return out

    # Fail: keep store (manual/env/pending) — clear Persian error
    err = str(live.get("error") or ERR_LIVE_FAIL)
    return _rate_response(live=False, configured=True, error=err)


def put_rate(body: dict) -> dict:
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر", "live": False, "configured": _env_rate_source() == "tgju"}
    symbol = (body.get("symbol") or body.get("goldSymbol") or "").strip()
    rate_raw = body.get(
        "rialPerGram", body.get("rateRialPerGram", body.get("rate", body.get("rial_per_gram")))
    )
    rate = _dec(rate_raw)
    if rate is None or rate <= 0:
        return {"ok": False, "error": "نرخ هر گرم (ریال) نامعتبر است"}
    notes = str(body.get("notes") or "").strip()
    with _STORE_LOCK:
        if symbol:
            _RATE["symbol"] = symbol
        _RATE["rialPerGram"] = str(rate)
        _RATE["source"] = str(body.get("source") or "MANUAL")
        _RATE["asOf"] = iso_now()
        if notes:
            _RATE["notes"] = notes
        else:
            _RATE["notes"] = "MANUAL via API/UI"
        _RATE["loanBlocked"] = True
    # Do not force live refresh after manual put — return store as MANUAL
    return _rate_response(
        live=False,
        configured=_env_rate_source() == "tgju",
        error=None,
        skip_live_refresh=True,
    )


def _current_rate_decimal() -> Decimal:
    _ensure_seeded()
    with _STORE_LOCK:
        return _dec(_RATE.get("rialPerGram"), DEFAULT_RATE_RIAL_PER_GRAM) or DEFAULT_RATE_RIAL_PER_GRAM


def compute_fees(
    *,
    milligrams: Any = None,
    grams: Any = None,
    rate_rial_per_gram: Any = None,
    side: str = "entry",
) -> dict:
    """Fee preview for deposit (entry 1%) or redeem (exit 2%).

    Asset value = grams * rate. Fee applied to asset value.
    """
    mg: Decimal | None = None
    if milligrams is not None and str(milligrams).strip() != "":
        mg = _dec(milligrams)
    elif grams is not None and str(grams).strip() != "":
        mg = grams_to_milligrams(grams)
    if mg is None or mg <= 0:
        return {"ok": False, "error": "مقدار گرم یا میلی‌گرم نامعتبر است"}
    mg = _q_mg(mg)
    g = milligrams_to_grams(mg)
    rate = _dec(rate_rial_per_gram)
    if rate is None or rate <= 0:
        rate = _current_rate_decimal()
    gross = g * rate
    side_n = (side or "entry").lower().strip()
    if side_n in ("exit", "redeem", "withdraw", "ابطال", "بازخرید"):
        fee_pct = FEE_EXIT_PCT
        side_out = "exit"
        fee_kind = LEDGER_FEE_EXIT
    else:
        fee_pct = FEE_ENTRY_PCT
        side_out = "entry"
        fee_kind = LEDGER_FEE_ENTRY
    fee = gross * (fee_pct / Decimal("100"))
    gross_rial = _q_rial(gross)
    fee_rial = _q_rial(fee)
    if side_out == "entry":
        total_rial = gross_rial + fee_rial  # pay asset + fee
        net_rial = gross_rial  # gold credited at full grams
    else:
        total_rial = max(0, gross_rial - fee_rial)  # net payout
        net_rial = total_rial
    return {
        "ok": True,
        "side": side_out,
        "milligrams": float(mg),
        "milligramsStr": str(mg),
        "grams": float(g),
        "gramsStr": str(g),
        "rateRialPerGram": float(rate),
        "rateRialPerGramStr": str(rate),
        "assetValueRial": gross_rial,
        "feePct": float(fee_pct),
        "feeRial": fee_rial,
        "feeKind": fee_kind,
        "totalRial": total_rial,
        "netRial": net_rial,
        "loanBlocked": True,
        "demoStub": (_RATE.get("source") or "").upper() in ("DEMO_STUB", "DEMO"),
    }


def preview_from_query_or_body(params: dict) -> dict:
    if not isinstance(params, dict):
        return {"ok": False, "error": "پارامتر نامعتبر"}
    # flatten list values from parse_qs
    flat: dict[str, Any] = {}
    for k, v in params.items():
        if isinstance(v, list):
            flat[k] = v[0] if v else None
        else:
            flat[k] = v
    return compute_fees(
        milligrams=flat.get("milligrams", flat.get("mg")),
        grams=flat.get("grams", flat.get("g")),
        rate_rial_per_gram=flat.get("useRate", flat.get("rate", flat.get("rialPerGram"))),
        side=str(flat.get("side") or flat.get("kind") or "entry"),
    )


def _public_position(p: dict) -> dict:
    mg = _dec(p.get("milligrams"), Decimal("0")) or Decimal("0")
    g = milligrams_to_grams(mg)
    return {
        "id": p["id"],
        "customerId": p.get("customerId"),
        "customerLabel": p.get("customerLabel") or "",
        "milligrams": float(mg),
        "milligramsStr": str(_q_mg(mg)),
        "grams": float(g),
        "gramsStr": str(g),
        "loanBlocked": True,
        "product": "sima_zar",
        "productLabel": "سیما زر",
        "status": p.get("status") or "active",
        "createdAt": p.get("createdAt"),
        "updatedAt": p.get("updatedAt"),
        "notes": p.get("notes") or "",
    }


def list_positions(customer_id: Any = None) -> dict:
    _ensure_seeded()
    with _STORE_LOCK:
        items = list(_POSITIONS)
    if customer_id is not None and str(customer_id).strip() != "":
        cid = str(customer_id).strip()
        items = [p for p in items if str(p.get("customerId") or "") == cid]
    pub = [_public_position(p) for p in items if (p.get("status") or "active") != "closed" or True]
    total_mg = sum((_dec(p.get("milligrams"), Decimal("0")) or Decimal("0")) for p in items)
    return {
        "ok": True,
        "items": pub,
        "count": len(pub),
        "totalMilligrams": float(_q_mg(total_mg)),
        "totalGrams": float(milligrams_to_grams(total_mg)),
        "loanBlocked": True,
        "loanBlockReason": LOAN_BLOCK_REASON_FA,
    }


def _append_ledger(
    *,
    position_id: int,
    kind: str,
    milligrams: Decimal,
    rial: int,
    rate: Decimal,
    meta: dict | None = None,
) -> dict:
    global _NEXT_LEDGER_ID
    entry = {
        "id": _NEXT_LEDGER_ID,
        "positionId": position_id,
        "kind": kind,
        "milligrams": str(_q_mg(milligrams)),
        "rial": rial,
        "rateRialPerGram": str(rate),
        "createdAt": iso_now(),
        "meta": meta or {},
    }
    _NEXT_LEDGER_ID += 1
    _LEDGER.append(entry)
    return entry


def deposit(body: dict) -> dict:
    """واریز دارایی — credit milligrams; charge 1% entry fee on asset value."""
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}

    mg: Decimal | None = None
    if body.get("milligrams") is not None and str(body.get("milligrams")).strip() != "":
        mg = _dec(body.get("milligrams"))
    elif body.get("grams") is not None and str(body.get("grams")).strip() != "":
        mg = grams_to_milligrams(body.get("grams"))
    if mg is None or mg <= 0:
        return {"ok": False, "error": "مقدار گرم یا میلی‌گرم الزامی است"}
    mg = _q_mg(mg)

    rate = _dec(body.get("useRate", body.get("rate", body.get("rialPerGram"))))
    if rate is None or rate <= 0:
        rate = _current_rate_decimal()

    fees = compute_fees(milligrams=mg, rate_rial_per_gram=rate, side="entry")
    if not fees.get("ok"):
        return fees

    customer_id = body.get("customerId", body.get("customer_id"))
    customer_label = str(body.get("customerLabel") or body.get("customer_label") or "").strip()
    position_id = body.get("positionId", body.get("position_id"))
    notes = str(body.get("notes") or "").strip()

    global _NEXT_POS_ID
    with _STORE_LOCK:
        pos = None
        if position_id is not None and str(position_id).strip() != "":
            try:
                pid = int(position_id)
            except (TypeError, ValueError):
                return {"ok": False, "error": "شناسه موقعیت نامعتبر است"}
            for p in _POSITIONS:
                if int(p["id"]) == pid:
                    pos = p
                    break
            if not pos:
                return {"ok": False, "error": "موقعیت یافت نشد"}
        else:
            pos = {
                "id": _NEXT_POS_ID,
                "customerId": customer_id,
                "customerLabel": customer_label or (f"مشتری {customer_id}" if customer_id else "بدون مشتری"),
                "milligrams": "0",
                "status": "active",
                "loanBlocked": True,
                "createdAt": iso_now(),
                "updatedAt": iso_now(),
                "notes": notes,
            }
            _NEXT_POS_ID += 1
            _POSITIONS.append(pos)

        cur = _dec(pos.get("milligrams"), Decimal("0")) or Decimal("0")
        new_mg = _q_mg(cur + mg)
        pos["milligrams"] = str(new_mg)
        pos["updatedAt"] = iso_now()
        pos["loanBlocked"] = True
        if customer_id is not None:
            pos["customerId"] = customer_id
        if customer_label:
            pos["customerLabel"] = customer_label

        _append_ledger(
            position_id=int(pos["id"]),
            kind=LEDGER_DEPOSIT,
            milligrams=mg,
            rial=int(fees["assetValueRial"]),
            rate=rate,
            meta={"side": "entry"},
        )
        _append_ledger(
            position_id=int(pos["id"]),
            kind=LEDGER_FEE_ENTRY,
            milligrams=Decimal("0"),
            rial=int(fees["feeRial"]),
            rate=rate,
            meta={"feePct": float(FEE_ENTRY_PCT)},
        )
        pub = _public_position(pos)

    return {
        "ok": True,
        "position": pub,
        "deposit": {
            "milligrams": float(mg),
            "grams": float(milligrams_to_grams(mg)),
            "assetValueRial": fees["assetValueRial"],
            "feeEntryPct": float(FEE_ENTRY_PCT),
            "feeEntryRial": fees["feeRial"],
            "totalPaidRial": fees["totalRial"],
            "rateRialPerGram": float(rate),
        },
        "loanBlocked": True,
        "loanBlockReason": LOAN_BLOCK_REASON_FA,
        "demoStub": (_RATE.get("source") or "").upper() in ("DEMO_STUB", "DEMO"),
    }


def redeem(body: dict) -> dict:
    """ابطال / بازخرید — debit milligrams; charge 2% exit fee on asset value."""
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}

    position_id = body.get("positionId", body.get("position_id"))
    if position_id is None or str(position_id).strip() == "":
        return {"ok": False, "error": "شناسه موقعیت الزامی است"}
    try:
        pid = int(position_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "شناسه موقعیت نامعتبر است"}

    mg: Decimal | None = None
    if body.get("milligrams") is not None and str(body.get("milligrams")).strip() != "":
        mg = _dec(body.get("milligrams"))
    elif body.get("grams") is not None and str(body.get("grams")).strip() != "":
        mg = grams_to_milligrams(body.get("grams"))
    if mg is None or mg <= 0:
        return {"ok": False, "error": "مقدار میلی‌گرم (یا گرم) الزامی است"}
    mg = _q_mg(mg)

    rate = _dec(body.get("useRate", body.get("rate", body.get("rialPerGram"))))
    if rate is None or rate <= 0:
        rate = _current_rate_decimal()

    fees = compute_fees(milligrams=mg, rate_rial_per_gram=rate, side="exit")
    if not fees.get("ok"):
        return fees

    with _STORE_LOCK:
        pos = None
        for p in _POSITIONS:
            if int(p["id"]) == pid:
                pos = p
                break
        if not pos:
            return {"ok": False, "error": "موقعیت یافت نشد"}
        cur = _dec(pos.get("milligrams"), Decimal("0")) or Decimal("0")
        if mg > cur:
            return {
                "ok": False,
                "error": f"موجودی کافی نیست (موجودی: {cur} میلی‌گرم)",
                "availableMilligrams": float(cur),
            }
        new_mg = _q_mg(cur - mg)
        pos["milligrams"] = str(new_mg)
        pos["updatedAt"] = iso_now()
        pos["loanBlocked"] = True
        if new_mg == 0:
            pos["status"] = "closed"

        _append_ledger(
            position_id=pid,
            kind=LEDGER_WITHDRAW,
            milligrams=mg,
            rial=int(fees["assetValueRial"]),
            rate=rate,
            meta={"side": "exit"},
        )
        _append_ledger(
            position_id=pid,
            kind=LEDGER_FEE_EXIT,
            milligrams=Decimal("0"),
            rial=int(fees["feeRial"]),
            rate=rate,
            meta={"feePct": float(FEE_EXIT_PCT)},
        )
        pub = _public_position(pos)

    return {
        "ok": True,
        "position": pub,
        "redeem": {
            "milligrams": float(mg),
            "grams": float(milligrams_to_grams(mg)),
            "assetValueRial": fees["assetValueRial"],
            "feeExitPct": float(FEE_EXIT_PCT),
            "feeExitRial": fees["feeRial"],
            "netPayoutRial": fees["netRial"],
            "rateRialPerGram": float(rate),
        },
        "loanBlocked": True,
        "loanBlockReason": LOAN_BLOCK_REASON_FA,
        "demoStub": (_RATE.get("source") or "").upper() in ("DEMO_STUB", "DEMO"),
    }


def loan_check(body: dict | None = None) -> dict:
    """Always reject — سیما زر does not allow loans against the position."""
    _ensure_seeded()
    body = body if isinstance(body, dict) else {}
    return {
        "ok": False,
        "allowed": False,
        "loanBlocked": True,
        "reason": LOAN_BLOCK_REASON_FA,
        "reasonCode": "SIMA_ZAR_LOAN_BLOCKED",
        "product": "sima_zar",
        "positionId": body.get("positionId") or body.get("position_id"),
        "policyId": body.get("policyId") or body.get("policy_id"),
        "customerId": body.get("customerId") or body.get("customer_id"),
    }


def meta() -> dict:
    mode = _env_rate_source()
    return {
        "ok": True,
        "module": "sima_zar_m2",
        "product": "sima_zar",
        "productLabel": "سیما زر",
        "defaultSymbol": DEFAULT_SYMBOL,
        "feeEntryPct": float(FEE_ENTRY_PCT),
        "feeExitPct": float(FEE_EXIT_PCT),
        "loanBlocked": True,
        "loanBlockReason": LOAN_BLOCK_REASON_FA,
        "units": {"gram": "g", "milligram": "mg", "mgPerGram": 1000},
        "rateSource": mode,
        "configured": mode == "tgju",
        "demoStub": mode == "demo",
        "disclaimer": (
            SOURCE_LABEL_TGJU + " — نرخ زنده از tgju."
            if mode == "tgju"
            else "DEMO_STUB — نرخ نمونه؛ اسکرپ زنده نیست."
            if mode == "demo"
            else "نرخ دستی — SIMA_ZAR_RATE_SOURCE=manual."
        ),
        "ledgerKinds": list(LEDGER_KINDS),
        "envKeys": [
            "SIMA_ZAR_RATE_SOURCE",
            "SIMA_ZAR_RATE_URL",
            "SIMA_ZAR_RATE_KEY",
            "SIMA_ZAR_RATE_TIMEOUT_SEC",
            "SIMA_ZAR_RATE_CACHE_SEC",
            "SIMA_ZAR_SYMBOL",
            "SIMA_ZAR_RATE_RIAL_PER_GRAM",
        ],
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
    """Route sima-zar API. path already rstrip('/') without query.

    Returns (status_code, json_obj).
    """
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/sima-zar/meta" and method == "GET":
        return 200, meta()

    if path == "/api/sima-zar/rate":
        if method == "GET":
            refresh_raw = _qs_first(query, "refresh", "force")
            force = str(refresh_raw or "").strip().lower() in ("1", "true", "yes", "refresh")
            return 200, get_rate(force_refresh=force)
        if method in ("PUT", "POST"):
            result = put_rate(body)
            return (200 if result.get("ok") else 400), result

    if path == "/api/sima-zar/positions" and method == "GET":
        cid = _qs_first(query, "customerId", "customer_id")
        if cid is None:
            cid = body.get("customerId") or body.get("customer_id")
        return 200, list_positions(cid)

    if path == "/api/sima-zar/preview" and method == "GET":
        # merge query + optional empty body
        merged = dict(query)
        for k, v in body.items():
            merged.setdefault(k, v)
        result = preview_from_query_or_body(merged)
        return (200 if result.get("ok") else 400), result

    if path == "/api/sima-zar/preview" and method == "POST":
        result = preview_from_query_or_body(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/sima-zar/deposit" and method == "POST":
        result = deposit(body)
        code = 200 if result.get("ok") else 400
        return code, result

    if path == "/api/sima-zar/redeem" and method == "POST":
        result = redeem(body)
        code = 200 if result.get("ok") else 400
        return code, result

    if path == "/api/sima-zar/loan-check" and method == "POST":
        # Always blocked — HTTP 200 with allowed:false (contract), or 403
        result = loan_check(body)
        return 403, result

    if path == "/api/sima-zar/loan-check" and method == "GET":
        result = loan_check({"positionId": _qs_first(query, "positionId", "position_id")})
        return 403, result

    return 404, {"ok": False, "error": "not found"}
