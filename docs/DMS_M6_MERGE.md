# DMS M6 — DevOps merge notes

## What
Skeleton for بایگانی / DMS: physical archive barcode/QR + warehouse address,
proposal documents with SHA-256 tamper-evident hash, e-sign/fingerprint **stub**,
Persian OCR **stub** field map.
**No real biometrics hardware. No real ML OCR.**

## Handoff locks (cite)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab/DMS/Loyalty/Branch = Eng-only)
- Brief module 6: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md`
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3684–3691, 865–867, 3996+)

DMS is Eng-module-only for this Excel batch. Accept future link keys:
`policy_number`, `policyholder_code`, `national_id`, `case_365`.
Do **not** invent locked `insurance_type` values.

## Files in repo (branch `feat/dms-m6`)
- `vps/dms.py`
- `vps/migrations/007_dms_m6.sql`
- Wire in `vps/app.py` (import + GET/POST `/api/dms*`) — additive only
- Frontend: `src/routes/dms.tsx`, nav «بایگانی» in `app-shell.tsx` secondary
- Docs: `docs/DMS_M6.md`
- Tests: `vps/test_dms.py`, `src/lib/dms.test.ts`

## Drop-in (if live `app.py` diverges)
1. Copy `/workspace/shared/fasihi-dms-m6.py` → VPS as `dms.py` next to `app.py`.
2. In `app.py`:
   ```python
   try:
       import dms
   except ImportError:
       from vps import dms
   ```
3. In `do_GET` / `do_POST`: if `path.startswith("/api/dms")` → `dms.handle_request(...)`.
4. Optional: apply `007_dms_m6.sql` (module works in-memory without it).

## Web deploy
**HOLD** — do not ship web tar unless CoS lifts HOLD.

## VERIFY
```bash
cd vps && python3 -m unittest test_dms -v
bun test src/lib/dms.test.ts
curl -sS "$API/api/dms/meta" | jq '.ok,.noRealBiometrics,.noRealMl'
curl -sS -X POST "$API/api/dms/archive/assign" -H 'Content-Type: application/json' \
  -d '{"dossierKey":"D-1","branch":"3045","shelf":"A1","row":"03","binder":"Z12"}' | jq '.barcode'
curl -sS -X POST "$API/api/dms/documents" -H 'Content-Type: application/json' \
  -d '{"dossierKey":"D-1","kind":"proposal"}' | jq '.documentHash'
curl -sS -X POST "$API/api/dms/sign" -H 'Content-Type: application/json' \
  -d '{"documentId":1,"method":"touch","payloadStub":[{"x":1,"y":2}]}' | jq '.documentHash,.realBiometrics'
curl -sS -X POST "$API/api/dms/ocr" -H 'Content-Type: application/json' \
  -d '{"docType":"national_id_card"}' | jq '.mappedFields,.realMl'
```

Nav: **سایر → بایگانی** → `/dms`

## M1–M5 preserved
Branch from `feat/sanhab-m5` (f9bce2b). Do not revert sales-network, sima-zar,
omid-pension, group-health, or sanhab core files — additive app.py routes + nav only.
