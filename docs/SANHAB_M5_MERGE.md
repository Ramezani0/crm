# Sanhab M5 — DevOps merge notes

## What
Skeleton for سنهاب / بیمه مرکزی: death-sum ceiling inquiry, plate/VIN NCD stub,
کد یکتا assignment, periodic issuance/endorsement/financial_tx export queue (JSON+CSV stub).
**No real Sanhab network calls.**

## Handoff locks (cite)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md` (§4 Sanhab Eng-only)
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md`
- Brief module 5: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md`
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3675–3682, 523–532, 1578)

Sanhab is Eng-module-only for this Excel batch. Accept future land shape:
`policy_number`, `computer_code`, `national_id`, plate/VIN in `case_365`, Jalali TEXT.
Do **not** invent locked `insurance_type` values.

## Files in repo (branch `feat/sanhab-m5`)
- `vps/sanhab.py`
- `vps/migrations/006_sanhab_m5.sql`
- Wire in `vps/app.py` (import + GET/PUT/POST `/api/sanhab*`) — additive only
- Frontend: `src/routes/sanhab.tsx`, nav «سنهاب» in `app-shell.tsx` secondary
- Docs: `docs/SANHAB_M5.md`
- Tests: `vps/test_sanhab.py`, `src/lib/sanhab.test.ts`

## Drop-in (if live `app.py` diverges)
1. Copy `/workspace/shared/fasihi-sanhab-m5.py` → VPS as `sanhab.py` next to `app.py`.
2. In `app.py`:
   ```python
   try:
       import sanhab
   except ImportError:
       from vps import sanhab
   ```
3. In `do_GET` / `do_PUT` / `do_POST`: if `path.startswith("/api/sanhab")` → `sanhab.handle_request(...)`.
4. Optional: apply `006_sanhab_m5.sql` (module works in-memory without it).

## Web deploy
**HOLD** — do not ship web tar unless CoS lifts HOLD.

## VERIFY
```bash
cd vps && python3 -m unittest test_sanhab -v
bun test src/lib/sanhab.test.ts
curl -sS "$API/api/sanhab/meta" | jq '.ok,.noNetwork,.uniqueCodeFormat'
curl -sS -X POST "$API/api/sanhab/death-inquiry" -H 'Content-Type: application/json' \
  -d '{"nationalId":"0076543210","proposedCapital":5000000000}' | jq '.overLimit,.inquiry.excessRial'
curl -sS -X POST "$API/api/sanhab/unique-code" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"TP-1"}' | jq '.uniqueCode'
curl -sS -X POST "$API/api/sanhab/export-queue" -H 'Content-Type: application/json' \
  -d '{"kind":"issuance","payload":{"policyNumber":"TP-1"}}'
curl -sS -X POST "$API/api/sanhab/export/run" -H 'Content-Type: application/json' -d '{}' | jq '.exported,.batch.jsonPath'
```

Nav: **سایر → سنهاب** → `/sanhab`

## M1–M4 preserved
Branch from `feat/group-health-m4` (ae6b870). Do not revert sales-network, sima-zar,
omid-pension, or group-health core files — additive app.py routes + nav only.
