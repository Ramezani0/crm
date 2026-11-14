"""M1 Sales Network — agent hierarchy + multi-tier commission (skeleton).

Stdlib-friendly. Works with in-memory store (demo/seed) and optional PostgreSQL
when a connection is provided. NEVER touches customers/policies/installments.

DEMO_DEFAULTS: placeholder rates — NOT legal/actuarial. Documented in
docs/SALES_NETWORK_M1.md. Replace before production.
"""
from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone
from typing import Any

# --- Roles (Persian labels) -------------------------------------------------
ROLE_GENERAL = "general"
ROLE_AYEEN96 = "ayeen96"
ROLE_BROKER = "broker"
ROLE_DEV_MGR = "development_manager"
ROLE_MARKETER = "marketer"

AGENT_ROLES = (
    ROLE_GENERAL,
    ROLE_AYEEN96,
    ROLE_BROKER,
    ROLE_DEV_MGR,
    ROLE_MARKETER,
)

ROLE_LABELS_FA = {
    ROLE_GENERAL: "جنرال",
    ROLE_AYEEN96: "آیین۹۶",
    ROLE_BROKER: "کارگزار",
    ROLE_DEV_MGR: "مدیرتوسعه",
    ROLE_MARKETER: "بازاریاب",
}

KIND_ISSUANCE = "issuance"
KIND_COLLECTION = "collection"
KIND_SUPERVISORY = "supervisory"
COMMISSION_KINDS = (KIND_ISSUANCE, KIND_COLLECTION, KIND_SUPERVISORY)

KIND_LABELS_FA = {
    KIND_ISSUANCE: "صدور",
    KIND_COLLECTION: "وصول",
    KIND_SUPERVISORY: "نظارتی",
}

# DEMO_DEFAULTS — NOT legal rates. Declining issuance Y1–Y5; smaller collection;
# supervisory by up-tree depth (1=parent …); withholding 10% example.
DEMO_ISSUANCE_PCT = {1: 20.0, 2: 15.0, 3: 12.0, 4: 10.0, 5: 8.0}
DEMO_COLLECTION_PCT = {1: 5.0, 2: 4.0, 3: 3.0, 4: 2.0, 5: 1.0}
# depth → rate_pct of premium (supervisory share for that ancestor)
DEMO_SUPERVISORY_PCT = {1: 2.0, 2: 1.0, 3: 0.5, 4: 0.25, 5: 0.1}
DEMO_WITHHOLDING_TAX_PCT = 10.0

_STORE_LOCK = threading.RLock()
_AGENTS: list[dict] = []
_RULES: list[dict] = []
_SETTINGS: dict[str, str] = {"withholding_tax_pct": str(DEMO_WITHHOLDING_TAX_PCT)}
_NEXT_ID = 1
_SEEDED = False


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _new_id() -> int:
    global _NEXT_ID
    nid = _NEXT_ID
    _NEXT_ID += 1
    return nid


def reset_store_for_tests() -> None:
    """Clear in-memory store (unit tests only)."""
    global _AGENTS, _RULES, _SETTINGS, _NEXT_ID, _SEEDED
    with _STORE_LOCK:
        _AGENTS = []
        _RULES = []
        _SETTINGS = {"withholding_tax_pct": str(DEMO_WITHHOLDING_TAX_PCT)}
        _NEXT_ID = 1
        _SEEDED = False


def default_commission_rules() -> list[dict]:
    rows: list[dict] = []
    for year, rate in DEMO_ISSUANCE_PCT.items():
        rows.append(
            {
                "id": None,
                "kind": KIND_ISSUANCE,
                "policyYear": year,
                "ratePct": rate,
                "withholdingTaxPct": None,
                "notes": "DEMO_DEFAULTS",
                "active": True,
            }
        )
    for year, rate in DEMO_COLLECTION_PCT.items():
        rows.append(
            {
                "id": None,
                "kind": KIND_COLLECTION,
                "policyYear": year,
                "ratePct": rate,
                "withholdingTaxPct": None,
                "notes": "DEMO_DEFAULTS",
                "active": True,
            }
        )
    for depth, rate in DEMO_SUPERVISORY_PCT.items():
        rows.append(
            {
                "id": None,
                "kind": KIND_SUPERVISORY,
                "policyYear": depth,  # reuse policy_year column as depth 1–5
                "ratePct": rate,
                "withholdingTaxPct": None,
                "notes": "DEMO_DEFAULTS depth=policyYear",
                "active": True,
            }
        )
    return rows


def _ensure_seeded() -> None:
    global _SEEDED, _NEXT_ID
    with _STORE_LOCK:
        if _SEEDED and _AGENTS:
            return
        if _AGENTS:
            _SEEDED = True
            return
        # Demo tree (agency 3045 skeleton)
        # جنرال → آیین۹۶ → کارگزار → مدیرتوسعه → بازاریاب
        g = {
            "id": 1,
            "code": "G-3045",
            "fullName": "فاطمه فصیحی",
            "parentId": None,
            "role": ROLE_GENERAL,
            "active": True,
            "phone": "09120000001",
            "nationalId": None,
            "notes": "نمایندگی ۳۰۴۵ — ریشه دمو",
            "createdAt": iso_now(),
        }
        a96 = {
            "id": 2,
            "code": "A96-01",
            "fullName": "مدیر آیین۹۶ نمونه",
            "parentId": 1,
            "role": ROLE_AYEEN96,
            "active": True,
            "phone": "09120000002",
            "nationalId": None,
            "notes": "DEMO",
            "createdAt": iso_now(),
        }
        br = {
            "id": 3,
            "code": "BR-01",
            "fullName": "کارگزار نمونه",
            "parentId": 2,
            "role": ROLE_BROKER,
            "active": True,
            "phone": "09120000003",
            "nationalId": None,
            "notes": "DEMO",
            "createdAt": iso_now(),
        }
        dm = {
            "id": 4,
            "code": "DM-01",
            "fullName": "مدیر توسعه نمونه",
            "parentId": 3,
            "role": ROLE_DEV_MGR,
            "active": True,
            "phone": "09120000004",
            "nationalId": None,
            "notes": "DEMO",
            "createdAt": iso_now(),
        }
        mk = {
            "id": 5,
            "code": "MK-01",
            "fullName": "بازاریاب نمونه",
            "parentId": 4,
            "role": ROLE_MARKETER,
            "active": True,
            "phone": "09120000005",
            "nationalId": None,
            "notes": "DEMO leaf",
            "createdAt": iso_now(),
        }
        _AGENTS[:] = [g, a96, br, dm, mk]
        _RULES[:] = []
        rid = 1
        for row in default_commission_rules():
            r = dict(row)
            r["id"] = rid
            rid += 1
            _RULES.append(r)
        _SETTINGS["withholding_tax_pct"] = str(DEMO_WITHHOLDING_TAX_PCT)
        _NEXT_ID = 6
        _SEEDED = True


def public_agent(row: dict) -> dict:
    role = row.get("role") or ""
    return {
        "id": row["id"],
        "code": row.get("code") or "",
        "fullName": row.get("fullName") or row.get("full_name") or "",
        "parentId": row.get("parentId") if "parentId" in row else row.get("parent_id"),
        "role": role,
        "roleLabel": ROLE_LABELS_FA.get(role, role),
        "active": bool(row.get("active", True)),
        "phone": row.get("phone") or "",
        "nationalId": row.get("nationalId") if "nationalId" in row else (row.get("national_id") or ""),
        "notes": row.get("notes") or "",
        "createdAt": row.get("createdAt") or row.get("created_at") or "",
    }


def public_rule(row: dict) -> dict:
    kind = row.get("kind") or ""
    return {
        "id": row.get("id"),
        "kind": kind,
        "kindLabel": KIND_LABELS_FA.get(kind, kind),
        "policyYear": int(row.get("policyYear") or row.get("policy_year") or 0),
        "ratePct": float(row.get("ratePct") if row.get("ratePct") is not None else row.get("rate_pct") or 0),
        "withholdingTaxPct": (
            float(row["withholdingTaxPct"])
            if row.get("withholdingTaxPct") is not None
            else (
                float(row["withholding_tax_pct"])
                if row.get("withholding_tax_pct") is not None
                else None
            )
        ),
        "notes": row.get("notes") or "",
        "active": bool(row.get("active", True)),
        "demoDefaults": True,
    }


def list_agents(*, active_only: bool = False) -> dict:
    _ensure_seeded()
    with _STORE_LOCK:
        items = [public_agent(a) for a in _AGENTS]
    if active_only:
        items = [a for a in items if a["active"]]
    return {
        "ok": True,
        "items": items,
        "roles": [{"id": k, "label": v} for k, v in ROLE_LABELS_FA.items()],
        "demoDefaults": True,
    }


def get_agent(agent_id: int | str) -> dict:
    _ensure_seeded()
    try:
        aid = int(agent_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "شناسه نماینده نامعتبر است"}
    with _STORE_LOCK:
        for a in _AGENTS:
            if int(a["id"]) == aid:
                return {"ok": True, "item": public_agent(a), "demoDefaults": True}
    return {"ok": False, "error": "نماینده یافت نشد"}


def create_agent(body: dict) -> dict:
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    code = str(body.get("code") or "").strip()
    full_name = str(body.get("fullName") or body.get("full_name") or "").strip()
    role = str(body.get("role") or "").strip()
    if not code or not full_name:
        return {"ok": False, "error": "کد و نام الزامی است"}
    if role not in AGENT_ROLES:
        return {
            "ok": False,
            "error": "نقش نامعتبر است",
            "allowedRoles": list(AGENT_ROLES),
        }
    parent_raw = body.get("parentId", body.get("parent_id"))
    parent_id = None
    if parent_raw is not None and str(parent_raw).strip() != "":
        try:
            parent_id = int(parent_raw)
        except (TypeError, ValueError):
            return {"ok": False, "error": "parentId نامعتبر است"}
    with _STORE_LOCK:
        if any(a["code"] == code for a in _AGENTS):
            return {"ok": False, "error": "کد نماینده تکراری است"}
        if parent_id is not None and not any(int(a["id"]) == parent_id for a in _AGENTS):
            return {"ok": False, "error": "والد یافت نشد"}
        row = {
            "id": _new_id(),
            "code": code,
            "fullName": full_name,
            "parentId": parent_id,
            "role": role,
            "active": bool(body.get("active", True)),
            "phone": str(body.get("phone") or "").strip(),
            "nationalId": str(body.get("nationalId") or body.get("national_id") or "").strip() or None,
            "notes": str(body.get("notes") or "").strip(),
            "createdAt": iso_now(),
        }
        _AGENTS.append(row)
        return {"ok": True, "item": public_agent(row), "demoDefaults": True}


def patch_agent(agent_id: int | str, body: dict) -> dict:
    _ensure_seeded()
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    try:
        aid = int(agent_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "شناسه نماینده نامعتبر است"}
    with _STORE_LOCK:
        target = None
        for a in _AGENTS:
            if int(a["id"]) == aid:
                target = a
                break
        if not target:
            return {"ok": False, "error": "نماینده یافت نشد"}
        if "code" in body:
            code = str(body.get("code") or "").strip()
            if not code:
                return {"ok": False, "error": "کد خالی مجاز نیست"}
            if any(a["code"] == code and int(a["id"]) != aid for a in _AGENTS):
                return {"ok": False, "error": "کد نماینده تکراری است"}
            target["code"] = code
        if "fullName" in body or "full_name" in body:
            name = str(body.get("fullName") or body.get("full_name") or "").strip()
            if not name:
                return {"ok": False, "error": "نام خالی مجاز نیست"}
            target["fullName"] = name
        if "role" in body:
            role = str(body.get("role") or "").strip()
            if role not in AGENT_ROLES:
                return {"ok": False, "error": "نقش نامعتبر است"}
            target["role"] = role
        if "active" in body:
            target["active"] = bool(body.get("active"))
        if "phone" in body:
            target["phone"] = str(body.get("phone") or "").strip()
        if "nationalId" in body or "national_id" in body:
            target["nationalId"] = str(
                body.get("nationalId") if "nationalId" in body else body.get("national_id") or ""
            ).strip() or None
        if "notes" in body:
            target["notes"] = str(body.get("notes") or "").strip()
        if "parentId" in body or "parent_id" in body:
            parent_raw = body.get("parentId", body.get("parent_id"))
            if parent_raw is None or str(parent_raw).strip() == "":
                target["parentId"] = None
            else:
                try:
                    parent_id = int(parent_raw)
                except (TypeError, ValueError):
                    return {"ok": False, "error": "parentId نامعتبر است"}
                if parent_id == aid:
                    return {"ok": False, "error": "والد نمی‌تواند خود نماینده باشد"}
                if not any(int(a["id"]) == parent_id for a in _AGENTS):
                    return {"ok": False, "error": "والد یافت نشد"}
                # prevent cycles: walk from parent up
                seen = {aid}
                cur = parent_id
                by_id = {int(a["id"]): a for a in _AGENTS}
                while cur is not None:
                    if cur in seen:
                        return {"ok": False, "error": "ایجاد حلقه در درخت مجاز نیست"}
                    seen.add(cur)
                    p = by_id.get(cur)
                    cur = p.get("parentId") if p else None
                target["parentId"] = parent_id
        return {"ok": True, "item": public_agent(target), "demoDefaults": True}


def build_tree() -> dict:
    _ensure_seeded()
    with _STORE_LOCK:
        agents = [public_agent(a) for a in _AGENTS]
    by_parent: dict[Any, list[dict]] = {}
    for a in agents:
        by_parent.setdefault(a["parentId"], []).append(a)

    def node_of(a: dict) -> dict:
        kids = sorted(by_parent.get(a["id"], []), key=lambda x: (x["code"], x["id"]))
        return {**a, "children": [node_of(c) for c in kids]}

    roots = sorted(by_parent.get(None, []), key=lambda x: (x["code"], x["id"]))
    tree = [node_of(r) for r in roots]
    active = sum(1 for a in agents if a["active"])
    return {
        "ok": True,
        "tree": tree,
        "stats": {
            "totalAgents": len(agents),
            "activeAgents": active,
            "inactiveAgents": len(agents) - active,
            "roots": len(roots),
        },
        "demoDefaults": True,
    }


def list_commission_rules() -> dict:
    _ensure_seeded()
    with _STORE_LOCK:
        rules = [public_rule(r) for r in _RULES]
        withholding = float(_SETTINGS.get("withholding_tax_pct") or DEMO_WITHHOLDING_TAX_PCT)
    return {
        "ok": True,
        "items": rules,
        "withholdingTaxPct": withholding,
        "demoDefaults": True,
        "disclaimer": "DEMO_DEFAULTS — نرخ‌های نمونه؛ مبنای حقوقی/اکچوئری نیستند.",
        "defaults": {
            "issuancePctByYear": dict(DEMO_ISSUANCE_PCT),
            "collectionPctByYear": dict(DEMO_COLLECTION_PCT),
            "supervisoryPctByDepth": dict(DEMO_SUPERVISORY_PCT),
            "withholdingTaxPct": DEMO_WITHHOLDING_TAX_PCT,
        },
    }


def _rate_lookup(rules: list[dict], kind: str, year: int) -> float:
    for r in rules:
        if r.get("kind") == kind and int(r.get("policyYear") or 0) == year and r.get("active", True):
            return float(r.get("ratePct") or 0)
    # fallback DEMO
    if kind == KIND_ISSUANCE:
        return float(DEMO_ISSUANCE_PCT.get(year, 0))
    if kind == KIND_COLLECTION:
        return float(DEMO_COLLECTION_PCT.get(year, 0))
    if kind == KIND_SUPERVISORY:
        return float(DEMO_SUPERVISORY_PCT.get(year, 0))
    return 0.0


def _withholding_pct(rules: list[dict], settings: dict, kind: str, year: int) -> float:
    for r in rules:
        if r.get("kind") == kind and int(r.get("policyYear") or 0) == year:
            w = r.get("withholdingTaxPct")
            if w is not None:
                return float(w)
    return float(settings.get("withholding_tax_pct") or DEMO_WITHHOLDING_TAX_PCT)


def round_rial(value: float) -> int:
    """Nearest rial (int)."""
    return int(round(value))


def preview_commission(
    *,
    premium_rial: float | int,
    policy_year: int,
    agent_id: int | str,
) -> dict:
    """Pure-ish preview: chain splits + tax. Uses in-memory tree/rules.

    Returns splits for selling agent (issuance+collection) and ancestors (supervisory).
    """
    _ensure_seeded()
    try:
        premium = float(premium_rial)
    except (TypeError, ValueError):
        return {"ok": False, "error": "حق بیمه نامعتبر است"}
    if premium < 0:
        return {"ok": False, "error": "حق بیمه منفی مجاز نیست"}
    try:
        year = int(policy_year)
    except (TypeError, ValueError):
        return {"ok": False, "error": "سال بیمه‌نامه نامعتبر است"}
    if year < 1 or year > 5:
        return {"ok": False, "error": "سال بیمه‌نامه باید ۱ تا ۵ باشد"}
    try:
        aid = int(agent_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "شناسه نماینده نامعتبر است"}

    with _STORE_LOCK:
        agents = copy.deepcopy(_AGENTS)
        rules = [public_rule(r) for r in _RULES]
        settings = dict(_SETTINGS)

    by_id = {int(a["id"]): a for a in agents}
    seller = by_id.get(aid)
    if not seller:
        return {"ok": False, "error": "نماینده یافت نشد"}

    issuance_pct = _rate_lookup(rules, KIND_ISSUANCE, year)
    collection_pct = _rate_lookup(rules, KIND_COLLECTION, year)
    tax_pct = _withholding_pct(rules, settings, KIND_ISSUANCE, year)

    splits: list[dict] = []

    def add_split(
        agent: dict,
        kind: str,
        rate_pct: float,
        *,
        depth: int | None = None,
    ) -> None:
        gross = round_rial(premium * (rate_pct / 100.0))
        tax = round_rial(gross * (tax_pct / 100.0))
        net = gross - tax
        pub = public_agent(agent)
        splits.append(
            {
                "agentId": pub["id"],
                "agentCode": pub["code"],
                "agentName": pub["fullName"],
                "role": pub["role"],
                "roleLabel": pub["roleLabel"],
                "kind": kind,
                "kindLabel": KIND_LABELS_FA.get(kind, kind),
                "depth": depth,
                "ratePct": rate_pct,
                "grossRial": gross,
                "withholdingTaxPct": tax_pct,
                "taxRial": tax,
                "netRial": net,
            }
        )

    add_split(seller, KIND_ISSUANCE, issuance_pct, depth=0)
    add_split(seller, KIND_COLLECTION, collection_pct, depth=0)

    # Walk up-tree for supervisory
    depth = 1
    cur_parent = seller.get("parentId")
    seen = {aid}
    while cur_parent is not None and depth <= 5:
        if cur_parent in seen:
            break
        seen.add(cur_parent)
        ancestor = by_id.get(int(cur_parent))
        if not ancestor:
            break
        sup_pct = _rate_lookup(rules, KIND_SUPERVISORY, depth)
        if sup_pct > 0:
            add_split(ancestor, KIND_SUPERVISORY, sup_pct, depth=depth)
        cur_parent = ancestor.get("parentId")
        depth += 1

    total_gross = sum(s["grossRial"] for s in splits)
    total_tax = sum(s["taxRial"] for s in splits)
    total_net = sum(s["netRial"] for s in splits)

    return {
        "ok": True,
        "premiumRial": round_rial(premium),
        "policyYear": year,
        "agentId": aid,
        "agent": public_agent(seller),
        "splits": splits,
        "totals": {
            "grossRial": total_gross,
            "taxRial": total_tax,
            "netRial": total_net,
        },
        "withholdingTaxPct": tax_pct,
        "demoDefaults": True,
        "disclaimer": "DEMO_DEFAULTS — نرخ‌های نمونه؛ مبنای حقوقی نیستند.",
    }


def preview_from_body(body: dict) -> dict:
    if not isinstance(body, dict):
        return {"ok": False, "error": "بدنه نامعتبر"}
    return preview_commission(
        premium_rial=body.get("premiumRial", body.get("premium_rial", 0)),
        policy_year=body.get("policyYear", body.get("policy_year", 1)),
        agent_id=body.get("agentId", body.get("agent_id", 0)),
    )


def meta() -> dict:
    return {
        "ok": True,
        "module": "sales_network_m1",
        "roles": [{"id": k, "label": v} for k, v in ROLE_LABELS_FA.items()],
        "kinds": [{"id": k, "label": v} for k, v in KIND_LABELS_FA.items()],
        "demoDefaults": True,
        "defaults": {
            "issuancePctByYear": dict(DEMO_ISSUANCE_PCT),
            "collectionPctByYear": dict(DEMO_COLLECTION_PCT),
            "supervisoryPctByDepth": dict(DEMO_SUPERVISORY_PCT),
            "withholdingTaxPct": DEMO_WITHHOLDING_TAX_PCT,
        },
        "disclaimer": "DEMO_DEFAULTS — not legal rates.",
    }


# --- HTTP dispatch helper (for app.py + drop-in merge) -----------------------

def handle_request(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    """Route sales-network API. path already rstrip('/') without query.

    Returns (status_code, json_obj). 404 if path not owned by this module.
    """
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}

    if path == "/api/sales-network/meta" and method == "GET":
        return 200, meta()

    if path == "/api/sales-network/agents":
        if method == "GET":
            return 200, list_agents()
        if method == "POST":
            result = create_agent(body)
            return (200 if result.get("ok") else 400), result

    if path.startswith("/api/sales-network/agents/"):
        aid = path[len("/api/sales-network/agents/") :].strip()
        if not aid or "/" in aid:
            return 400, {"ok": False, "error": "شناسه نامعتبر"}
        if method == "GET":
            result = get_agent(aid)
            return (200 if result.get("ok") else 404), result
        if method in ("PATCH", "PUT"):
            result = patch_agent(aid, body)
            code = 200 if result.get("ok") else (404 if "یافت نشد" in str(result.get("error")) else 400)
            return code, result

    if path == "/api/sales-network/tree" and method == "GET":
        return 200, build_tree()

    if path == "/api/sales-network/commission-rules" and method == "GET":
        return 200, list_commission_rules()

    if path == "/api/sales-network/commission/preview" and method == "POST":
        result = preview_from_body(body)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
