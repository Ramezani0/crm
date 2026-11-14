"""M6 DMS بایگانی — Document Management & Physical Archive (skeleton).

Stdlib-friendly in-memory store + optional SQL migration 007.
NEVER touches / wipes customers/policies/installments/M1–M5 tables.
NO real biometrics hardware · NO real ML OCR.

Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
Accept future land links via: policy_number, policyholder_code, national_id, case_365.
Do NOT invent insurance_type outside locked Import enum.
Cite:
  ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
  MODULE_FORMULA_IMPORT_LOCKS_20260924.md
  KARAFARIN_CORE_MODULES_BRIEF_20260924.md §6
  research insurance-crm-modules-gemini-20260924.txt (~3684–3691, 865–867, 3996+)

Features (DEMO stubs):
  1) Physical archive barcode/QR + warehouse address (branch/shelf/row/binder)
  2) Proposal documents + e-sign/fingerprint stub + SHA-256 document hash
  3) Persian OCR stub (national_id_card | birth_certificate | health_booklet | accident_sketch)
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import threading
from datetime import datetime, timezone
from typing import Any

MODULE = "dms"
MODULE_LABEL = "بایگانی / DMS"
PRODUCT_LABEL = MODULE_LABEL

# Barcode format: DMS-BR{branch}-SH{shelf}-RW{row}-BN{binder}-{hex8}
BARCODE_RE = re.compile(
    r"^DMS-BR[A-Z0-9]+-SH[A-Z0-9]+-RW[A-Z0-9]+-BN[A-Z0-9]+-[A-F0-9]{8}$"
)
BARCODE_PREFIX = "DMS"

DOCUMENT_KINDS = (
    "proposal",
    "national_id_card",
    "birth_certificate",
    "health_booklet",
    "accident_sketch",
    "other",
)

SIGN_METHODS = ("touch", "fingerprint")

OCR_DOC_TYPES = (
    "national_id_card",
    "birth_certificate",
    "health_booklet",
    "accident_sketch",
)

DEMO_DISCLAIMER = (
    "بایگانی/DMS: بارکد زونکن و OCR هنوز DEMO stub (بدون بیومتریک/ML واقعی). "
    "آپلود فایل پایدار از /api/dms/files → customer_documents + DOCUMENTS_ROOT "
    "(/opt/fasihi/documents). Excel HOLD · بدون wipe CRM · Eng-only این بچ."
)

ENG_EXTENSION_NOTE = (
    "DMS is Eng-module-only for this Excel batch "
    "(MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch = none in Excel). "
    "Future link keys: policy_number, policyholder_code, national_id, case_365. "
    "Do not invent locked insurance_type values."
)

HANDOFF_CITES = [
    "ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md",
    "MODULE_FORMULA_IMPORT_LOCKS_20260924.md",
    "KARAFARIN_CORE_MODULES_BRIEF_20260924.md",
]

# DEMO stub OCR field maps (no ML)
OCR_STUB_MAPS: dict[str, dict[str, str]] = {
    "national_id_card": {
        "name": "علی رضایی",
        "nationalId": "0012345678",
        "fatherName": "محمد",
        "birthDateJalali": "1370/05/12",
        "serial": "A123456",
    },
    "birth_certificate": {
        "name": "مریم احمدی",
        "nationalId": "0098765432",
        "fatherName": "حسین",
        "birthDateJalali": "1365/01/20",
        "birthCertNo": "۱۲۳۴۵۶",
        "placeOfBirth": "تهران",
    },
    "health_booklet": {
        "name": "رضا کریمی",
        "nationalId": "0055555555",
        "insuranceNo": "HB-998877",
        "issuer": "سازمان بیمه سلامت",
        "issueDateJalali": "1402/03/01",
    },
    "accident_sketch": {
        "sketchRef": "SK-1404-001",
        "plateA": "21الف12345",
        "plateB": "45ب67890",
        "accidentDateJalali": "1404/06/15",
        "location": "تهران، بزرگراه همت",
        "faultHint": "راننده الف",
    },
}

_STORE_LOCK = threading.RLock()
_ARCHIVE_LOCATIONS: list[dict] = []
_DOCUMENTS: list[dict] = []
_SIGNATURES: list[dict] = []
_OCR_JOBS: list[dict] = []
_DOCUMENT_HASHES: list[dict] = []
_NEXT_ARCHIVE_ID = 1
_NEXT_DOC_ID = 1
_NEXT_SIG_ID = 1
_NEXT_OCR_ID = 1
_NEXT_HASH_ID = 1
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


def _canon_json(obj: Any) -> str:
    """Canonical JSON for hashing — sorted keys, no whitespace variance."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_hex(payload: Any) -> str:
    """SHA-256 of canonical JSON (or utf-8 string). Stable across calls."""
    if isinstance(payload, (bytes, bytearray)):
        raw = bytes(payload)
    elif isinstance(payload, str):
        raw = payload.encode("utf-8")
    else:
        raw = _canon_json(payload).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _slug_part(value: Any, fallback: str = "X") -> str:
    s = re.sub(r"[^A-Za-z0-9]", "", str(value or "").upper())
    return s[:12] or fallback


def generate_barcode(
    branch: str,
    shelf: str,
    row: str,
    binder: str,
    *,
    seed: str | None = None,
) -> str:
    """Build unique archive barcode. hex8 derived from seed or address+time."""
    br = _slug_part(branch, "BR")
    sh = _slug_part(shelf, "SH")
    rw = _slug_part(row, "RW")
    bn = _slug_part(binder, "BN")
    material = seed or f"{br}|{sh}|{rw}|{bn}|{iso_now()}"
    hex8 = hashlib.sha256(material.encode("utf-8")).hexdigest()[:8].upper()
    return f"DMS-BR{br}-SH{sh}-RW{rw}-BN{bn}-{hex8}"


def is_valid_barcode(code: str | None) -> bool:
    if not code:
        return False
    return bool(BARCODE_RE.match(str(code).strip()))


def qr_payload_for(barcode: str, dossier_key: str, address: dict) -> str:
    """Compact QR payload string (not a real QR image — DEMO stub)."""
    return _canon_json(
        {
            "v": 1,
            "module": MODULE,
            "barcode": barcode,
            "dossierKey": dossier_key,
            "branch": address.get("branch"),
            "shelf": address.get("shelf"),
            "row": address.get("row"),
            "binder": address.get("binder"),
        }
    )


def reset_store_for_tests() -> None:
    global _NEXT_ARCHIVE_ID, _NEXT_DOC_ID, _NEXT_SIG_ID, _NEXT_OCR_ID, _NEXT_HASH_ID, _SEEDED
    with _STORE_LOCK:
        _ARCHIVE_LOCATIONS.clear()
        _DOCUMENTS.clear()
        _SIGNATURES.clear()
        _OCR_JOBS.clear()
        _DOCUMENT_HASHES.clear()
        _NEXT_ARCHIVE_ID = 1
        _NEXT_DOC_ID = 1
        _NEXT_SIG_ID = 1
        _NEXT_OCR_ID = 1
        _NEXT_HASH_ID = 1
        _SEEDED = False
    ensure_seed()


def ensure_seed() -> None:
    global _SEEDED, _NEXT_ARCHIVE_ID, _NEXT_DOC_ID, _NEXT_HASH_ID
    with _STORE_LOCK:
        if _SEEDED:
            return
        # Seed one archive location for DEMO dossier
        dossier = "Dossier-DEMO-3045"
        barcode = generate_barcode("3045", "A1", "03", "Z12", seed="seed-archive-1")
        addr = {"branch": "3045", "shelf": "A1", "row": "03", "binder": "Z12"}
        loc = {
            "id": _NEXT_ARCHIVE_ID,
            "dossierKey": dossier,
            "barcode": barcode,
            "qrPayload": qr_payload_for(barcode, dossier, addr),
            "branch": addr["branch"],
            "shelf": addr["shelf"],
            "row": addr["row"],
            "binder": addr["binder"],
            "policyNumber": None,
            "policyholderCode": None,
            "nationalId": None,
            "case365": {},
            "demoStub": True,
            "createdAt": iso_now(),
            "updatedAt": iso_now(),
        }
        _ARCHIVE_LOCATIONS.append(loc)
        _NEXT_ARCHIVE_ID += 1

        # Seed a proposal document with stable hash
        canonical = {
            "kind": "proposal",
            "dossierKey": dossier,
            "title": "فرم پیشنهاد عمر امید — DEMO",
            "fields": {"plan": "omid", "sumInsuredHint": 1000000000},
        }
        digest = sha256_hex(canonical)
        doc = {
            "id": _NEXT_DOC_ID,
            "dossierKey": dossier,
            "kind": "proposal",
            "title": canonical["title"],
            "meta": canonical["fields"],
            "canonicalPayload": canonical,
            "documentHash": digest,
            "hashAlgo": "sha256",
            "policyNumber": None,
            "policyholderCode": None,
            "nationalId": None,
            "case365": {},
            "signed": False,
            "signatureId": None,
            "demoStub": True,
            "createdAt": iso_now(),
            "updatedAt": iso_now(),
        }
        _DOCUMENTS.append(doc)
        _DOCUMENT_HASHES.append(
            {
                "id": _NEXT_HASH_ID,
                "documentId": doc["id"],
                "hashAlgo": "sha256",
                "documentHash": digest,
                "canonicalPayload": canonical,
                "createdAt": iso_now(),
                "demoStub": True,
            }
        )
        _NEXT_DOC_ID += 1
        _NEXT_HASH_ID += 1
        _SEEDED = True


# ── Archive ──────────────────────────────────────────────────────────────


def assign_archive(body: dict) -> dict:
    ensure_seed()
    dossier_key = str(body.get("dossierKey") or body.get("dossier_key") or "").strip()
    branch = str(body.get("branch") or "").strip()
    shelf = str(body.get("shelf") or "").strip()
    row = str(body.get("row") or "").strip()
    binder = str(body.get("binder") or body.get("zonkan") or "").strip()
    if not dossier_key:
        return {"ok": False, "error": "dossierKey الزامی است"}
    if not all([branch, shelf, row, binder]):
        return {"ok": False, "error": "branch, shelf, row, binder الزامی‌اند"}

    policy_number = body.get("policyNumber") or body.get("policy_number")
    policyholder_code = body.get("policyholderCode") or body.get("policyholder_code")
    national_id = body.get("nationalId") or body.get("national_id")
    case_365 = body.get("case365") or body.get("case_365") or {}
    if not isinstance(case_365, dict):
        case_365 = {}

    with _STORE_LOCK:
        global _NEXT_ARCHIVE_ID
        # Idempotent: same dossierKey updates address / regenerates barcode if address changed
        existing = next((a for a in _ARCHIVE_LOCATIONS if a["dossierKey"] == dossier_key), None)
        addr = {"branch": branch, "shelf": shelf, "row": row, "binder": binder}
        seed = f"{dossier_key}|{branch}|{shelf}|{row}|{binder}"
        barcode = generate_barcode(branch, shelf, row, binder, seed=seed)

        # Enforce barcode uniqueness (regenerate with nonce if collision with other dossier)
        collision = next(
            (a for a in _ARCHIVE_LOCATIONS if a["barcode"] == barcode and a["dossierKey"] != dossier_key),
            None,
        )
        if collision:
            barcode = generate_barcode(
                branch, shelf, row, binder, seed=f"{seed}|{_NEXT_ARCHIVE_ID}"
            )

        qr = qr_payload_for(barcode, dossier_key, addr)
        if existing:
            existing.update(
                {
                    "barcode": barcode,
                    "qrPayload": qr,
                    "branch": branch,
                    "shelf": shelf,
                    "row": row,
                    "binder": binder,
                    "policyNumber": policy_number,
                    "policyholderCode": policyholder_code,
                    "nationalId": national_id,
                    "case365": case_365,
                    "updatedAt": iso_now(),
                }
            )
            out = copy.deepcopy(existing)
            assigned = False
        else:
            loc = {
                "id": _NEXT_ARCHIVE_ID,
                "dossierKey": dossier_key,
                "barcode": barcode,
                "qrPayload": qr,
                "branch": branch,
                "shelf": shelf,
                "row": row,
                "binder": binder,
                "policyNumber": policy_number,
                "policyholderCode": policyholder_code,
                "nationalId": national_id,
                "case365": case_365,
                "demoStub": True,
                "createdAt": iso_now(),
                "updatedAt": iso_now(),
            }
            _ARCHIVE_LOCATIONS.append(loc)
            _NEXT_ARCHIVE_ID += 1
            out = copy.deepcopy(loc)
            assigned = True

    return {
        "ok": True,
        "assigned": assigned,
        "location": out,
        "barcode": out["barcode"],
        "qrPayload": out["qrPayload"],
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def lookup_archive(query: dict | None = None) -> dict:
    ensure_seed()
    barcode = _qget(query, "barcode")
    dossier_key = _qget(query, "dossierKey") or _qget(query, "dossier_key")
    if not barcode and not dossier_key:
        return {"ok": False, "error": "barcode یا dossierKey الزامی است", "found": False}

    with _STORE_LOCK:
        loc = None
        if barcode:
            loc = next((a for a in _ARCHIVE_LOCATIONS if a["barcode"] == barcode), None)
        if loc is None and dossier_key:
            loc = next((a for a in _ARCHIVE_LOCATIONS if a["dossierKey"] == dossier_key), None)
        if loc is None:
            return {"ok": True, "found": False, "location": None, "demoStub": True}
        return {
            "ok": True,
            "found": True,
            "location": copy.deepcopy(loc),
            "demoStub": True,
        }


def list_archives() -> dict:
    ensure_seed()
    with _STORE_LOCK:
        items = copy.deepcopy(_ARCHIVE_LOCATIONS)
    return {"ok": True, "count": len(items), "items": items, "demoStub": True}


# ── Documents + hash ─────────────────────────────────────────────────────


def create_document(body: dict) -> dict:
    ensure_seed()
    dossier_key = str(body.get("dossierKey") or body.get("dossier_key") or "").strip()
    kind = str(body.get("kind") or "other").strip()
    if not dossier_key:
        return {"ok": False, "error": "dossierKey الزامی است"}
    if kind not in DOCUMENT_KINDS:
        return {
            "ok": False,
            "error": f"kind نامعتبر؛ مجاز: {', '.join(DOCUMENT_KINDS)}",
        }

    meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
    title = str(body.get("title") or f"سند {kind}").strip()
    policy_number = body.get("policyNumber") or body.get("policy_number")
    policyholder_code = body.get("policyholderCode") or body.get("policyholder_code")
    national_id = body.get("nationalId") or body.get("national_id")
    case_365 = body.get("case365") or body.get("case_365") or {}
    if not isinstance(case_365, dict):
        case_365 = {}

    canonical = {
        "kind": kind,
        "dossierKey": dossier_key,
        "title": title,
        "fields": meta,
        "policyNumber": policy_number,
        "policyholderCode": policyholder_code,
        "nationalId": national_id,
    }
    digest = sha256_hex(canonical)

    with _STORE_LOCK:
        global _NEXT_DOC_ID, _NEXT_HASH_ID
        doc = {
            "id": _NEXT_DOC_ID,
            "dossierKey": dossier_key,
            "kind": kind,
            "title": title,
            "meta": meta,
            "canonicalPayload": canonical,
            "documentHash": digest,
            "hashAlgo": "sha256",
            "policyNumber": policy_number,
            "policyholderCode": policyholder_code,
            "nationalId": national_id,
            "case365": case_365,
            "signed": False,
            "signatureId": None,
            "demoStub": True,
            "createdAt": iso_now(),
            "updatedAt": iso_now(),
        }
        _DOCUMENTS.append(doc)
        _DOCUMENT_HASHES.append(
            {
                "id": _NEXT_HASH_ID,
                "documentId": doc["id"],
                "hashAlgo": "sha256",
                "documentHash": digest,
                "canonicalPayload": canonical,
                "createdAt": iso_now(),
                "demoStub": True,
            }
        )
        _NEXT_DOC_ID += 1
        _NEXT_HASH_ID += 1
        out = copy.deepcopy(doc)

    return {
        "ok": True,
        "document": out,
        "documentHash": digest,
        "hashAlgo": "sha256",
        "demoStub": True,
        "disclaimer": DEMO_DISCLAIMER,
    }


def get_document(doc_id: int | str) -> dict:
    ensure_seed()
    try:
        did = int(doc_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "documentId نامعتبر", "found": False}

    with _STORE_LOCK:
        doc = next((d for d in _DOCUMENTS if d["id"] == did), None)
        if doc is None:
            return {"ok": True, "found": False, "document": None, "demoStub": True}
        sig = None
        if doc.get("signatureId"):
            sig = next((s for s in _SIGNATURES if s["id"] == doc["signatureId"]), None)
        out = copy.deepcopy(doc)
        out["signature"] = copy.deepcopy(sig) if sig else None
        return {
            "ok": True,
            "found": True,
            "document": out,
            "documentHash": out["documentHash"],
            "hashAlgo": out.get("hashAlgo", "sha256"),
            "demoStub": True,
        }


# ── Sign ─────────────────────────────────────────────────────────────────


def sign_document(body: dict) -> dict:
    ensure_seed()
    try:
        doc_id = int(body.get("documentId") or body.get("document_id") or 0)
    except (TypeError, ValueError):
        return {"ok": False, "error": "documentId نامعتبر"}
    method = str(body.get("method") or "").strip()
    payload_stub = body.get("payloadStub") or body.get("payload_stub")
    if method not in SIGN_METHODS:
        return {
            "ok": False,
            "error": f"method نامعتبر؛ مجاز: {', '.join(SIGN_METHODS)}",
        }
    if payload_stub is None or payload_stub == "":
        return {"ok": False, "error": "payloadStub الزامی است (strokes یا fingerprint stub)"}

    with _STORE_LOCK:
        global _NEXT_SIG_ID
        doc = next((d for d in _DOCUMENTS if d["id"] == doc_id), None)
        if doc is None:
            return {"ok": False, "error": "سند یافت نشد"}

        # Attach signature to existing document hash (tamper-evident)
        document_hash = doc["documentHash"]
        # Meta blob: store strokes list or fingerprint stub — NEVER real biometrics
        if method == "touch":
            stub_meta = {
                "type": "touch_strokes",
                "strokes": payload_stub if isinstance(payload_stub, (list, dict, str)) else str(payload_stub),
            }
        else:
            stub_meta = {
                "type": "fingerprint_stub",
                "blobMeta": payload_stub if isinstance(payload_stub, (dict, str)) else {"raw": str(payload_stub)},
                "hardware": False,
                "note": "DEMO stub — no real biometric capture",
            }

        sig = {
            "id": _NEXT_SIG_ID,
            "documentId": doc_id,
            "method": method,
            "payloadStub": stub_meta,
            "documentHash": document_hash,
            "hashAlgo": "sha256",
            "signedAt": iso_now(),
            "demoStub": True,
            "realBiometrics": False,
        }
        _SIGNATURES.append(sig)
        doc["signed"] = True
        doc["signatureId"] = sig["id"]
        doc["updatedAt"] = iso_now()
        _NEXT_SIG_ID += 1
        out_sig = copy.deepcopy(sig)
        out_doc = copy.deepcopy(doc)

    return {
        "ok": True,
        "signature": out_sig,
        "document": out_doc,
        "documentHash": document_hash,
        "demoStub": True,
        "realBiometrics": False,
        "disclaimer": DEMO_DISCLAIMER,
    }


# ── OCR stub ─────────────────────────────────────────────────────────────


def map_ocr_fields(doc_type: str, stub_text: str | None = None) -> dict[str, str]:
    """DEMO stub map — no ML. Optional stubText may override name/nationalId via simple parse."""
    base = dict(OCR_STUB_MAPS.get(doc_type, {"note": "unknown_doc_type"}))
    if stub_text:
        text = stub_text.strip()
        # Very naive DEMO parser: "name:X|nationalId:Y" or free text → dump into ocrRaw
        if "|" in text and ":" in text:
            for part in text.split("|"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    k = k.strip()
                    v = v.strip()
                    if k and v:
                        # map common aliases
                        key_map = {
                            "name": "name",
                            "نام": "name",
                            "nationalId": "nationalId",
                            "national_id": "nationalId",
                            "کدملی": "nationalId",
                            "کد ملی": "nationalId",
                            "fatherName": "fatherName",
                            "نام پدر": "fatherName",
                        }
                        mapped = key_map.get(k, k)
                        base[mapped] = v
        else:
            base["ocrRaw"] = text
    return base


def create_ocr_job(body: dict) -> dict:
    ensure_seed()
    doc_type = str(body.get("docType") or body.get("doc_type") or "").strip()
    if doc_type not in OCR_DOC_TYPES:
        return {
            "ok": False,
            "error": f"docType نامعتبر؛ مجاز: {', '.join(OCR_DOC_TYPES)}",
        }
    image_meta = body.get("imageMeta") or body.get("image_meta") or {}
    if not isinstance(image_meta, dict):
        image_meta = {"note": str(image_meta)}
    stub_text = body.get("stubText") or body.get("stub_text")
    if stub_text is not None:
        stub_text = str(stub_text)

    fields = map_ocr_fields(doc_type, stub_text)

    with _STORE_LOCK:
        global _NEXT_OCR_ID
        job = {
            "id": _NEXT_OCR_ID,
            "docType": doc_type,
            "imageMeta": image_meta,
            "stubText": stub_text,
            "status": "done",
            "mappedFields": fields,
            "engine": "DEMO_STUB_MAP",
            "realMl": False,
            "createdAt": iso_now(),
            "completedAt": iso_now(),
            "demoStub": True,
        }
        _OCR_JOBS.append(job)
        _NEXT_OCR_ID += 1
        out = copy.deepcopy(job)

    return {
        "ok": True,
        "job": out,
        "mappedFields": fields,
        "demoStub": True,
        "realMl": False,
        "disclaimer": DEMO_DISCLAIMER,
    }


def get_ocr_job(job_id: int | str) -> dict:
    ensure_seed()
    try:
        jid = int(job_id)
    except (TypeError, ValueError):
        return {"ok": False, "error": "jobId نامعتبر", "found": False}

    with _STORE_LOCK:
        job = next((j for j in _OCR_JOBS if j["id"] == jid), None)
        if job is None:
            return {"ok": True, "found": False, "job": None, "demoStub": True}
        return {
            "ok": True,
            "found": True,
            "job": copy.deepcopy(job),
            "mappedFields": copy.deepcopy(job.get("mappedFields") or {}),
            "demoStub": True,
            "realMl": False,
        }


# ── Meta / router ────────────────────────────────────────────────────────


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
            "barcodeFormat": "DMS-BR{branch}-SH{shelf}-RW{row}-BN{binder}-{HEX8}",
            "barcodeRegex": BARCODE_RE.pattern,
            "documentKinds": list(DOCUMENT_KINDS),
            "signMethods": list(SIGN_METHODS),
            "ocrDocTypes": list(OCR_DOC_TYPES),
            "hashAlgo": "sha256",
            "futureLinkKeys": [
                "policy_number",
                "policyholder_code",
                "national_id",
                "case_365",
            ],
            "counts": {
                "archives": len(_ARCHIVE_LOCATIONS),
                "documents": len(_DOCUMENTS),
                "signatures": len(_SIGNATURES),
                "ocrJobs": len(_OCR_JOBS),
                "hashes": len(_DOCUMENT_HASHES),
            },
            "endpoints": [
                "GET /api/dms/meta",
                "POST /api/dms/archive/assign",
                "GET /api/dms/archive?barcode=|&dossierKey=",
                "GET /api/dms/archives",
                "POST /api/dms/documents",
                "GET /api/dms/documents/{id}",
                "POST /api/dms/sign",
                "POST /api/dms/ocr",
                "GET /api/dms/ocr/{jobId}",
                "GET /api/dms/files?customerId=",
                "POST /api/dms/files",
                "GET /api/dms/files/{id}/file",
                "POST /api/dms/files/{id}/delete",
            ],
            "durableFiles": {
                "via": "documents.py",
                "table": "customer_documents",
                "rootEnv": "DOCUMENTS_ROOT",
                "rootDefault": "/opt/fasihi/documents",
                "maxBytesEnv": "DOCUMENT_MAX_BYTES",
                "maxBytesDefault": 8388608,
                "types": ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"],
            },
            "noRealBiometrics": True,
            "noRealMl": True,
        }


def handle_request(
    method: str,
    path: str,
    body: dict | None = None,
    query: dict | None = None,
) -> tuple[int, dict]:
    """Route dms API. path already rstrip('/') without query."""
    method = (method or "GET").upper()
    path = (path or "").rstrip("/") or "/"
    body = body if isinstance(body, dict) else {}
    query = query if isinstance(query, dict) else {}

    if path == "/api/dms/meta" and method == "GET":
        return 200, meta()

    if path == "/api/dms/archive/assign" and method == "POST":
        result = assign_archive(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/dms/archive" and method == "GET":
        result = lookup_archive(query)
        return (200 if result.get("ok") else 400), result

    if path == "/api/dms/archives" and method == "GET":
        return 200, list_archives()

    if path == "/api/dms/documents" and method == "POST":
        result = create_document(body)
        return (200 if result.get("ok") else 400), result

    if path.startswith("/api/dms/documents/") and method == "GET":
        doc_id = path.rsplit("/", 1)[-1]
        result = get_document(doc_id)
        return (200 if result.get("ok") else 400), result

    if path == "/api/dms/sign" and method == "POST":
        result = sign_document(body)
        return (200 if result.get("ok") else 400), result

    if path == "/api/dms/ocr" and method == "POST":
        result = create_ocr_job(body)
        return (200 if result.get("ok") else 400), result

    if path.startswith("/api/dms/ocr/") and method == "GET":
        job_id = path.rsplit("/", 1)[-1]
        if job_id == "ocr":
            return 404, {"ok": False, "error": "not found"}
        result = get_ocr_job(job_id)
        return (200 if result.get("ok") else 400), result

    return 404, {"ok": False, "error": "not found"}
