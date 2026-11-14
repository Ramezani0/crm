# Branch Ops M8 — DevOps merge notes

## What
Skeleton for کارتابل شعب / عملیات نمایندگی: security paper inventory
(receipt / policy_sheet / hologram) lifecycle, commission variance stub,
incoming policyholder checks stub.
**DEMO serials. No Excel wipe. Eng-only.**

## Handoff locks (cite)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab/DMS/Loyalty/Branch = Eng-only)
- Brief module 8: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md`
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3702–3707, 4421–4424)

Branch ops is Eng-module-only for this Excel batch. Serial numbers DEMO.
No real hologram/printer/Sanhab integration.

## Files in repo (branch `feat/branch-ops-m8`)
- `vps/branch_ops.py`
- `vps/migrations/009_branch_ops_m8.sql`
- Wire in `vps/app.py` (import + GET/POST `/api/branch-ops*`) — additive only
- Frontend: `src/routes/branch-ops.tsx`, nav «عملیات شعبه» in `app-shell.tsx` secondary
- Docs: `docs/BRANCH_OPS_M8.md`
- Tests: `vps/test_branch_ops.py`, `src/lib/branch-ops.test.ts`

## Drop-in (if live `app.py` diverges)
1. Copy `/workspace/shared/fasihi-branch-ops-m8.py` → VPS as `branch_ops.py` next to `app.py`.
2. In `app.py`:
   ```python
   try:
       import branch_ops
   except ImportError:
       from vps import branch_ops
   ```
3. In `do_GET` / `do_POST`: if `path.startswith("/api/branch-ops")` → `branch_ops.handle_request(...)`.
4. Optional: apply `009_branch_ops_m8.sql` (module works in-memory without it).

## Web deploy
**HOLD** — do not ship web tar unless CoS lifts HOLD.

## VERIFY
```bash
cd vps && python3 -m unittest test_branch_ops -v
bun test src/lib/branch-ops.test.ts
curl -sS "$API/api/branch-ops/meta" | jq '.ok,.counts'
curl -sS "$API/api/branch-ops/stock" | jq '.count'
curl -sS -X POST "$API/api/branch-ops/stock/receive" -H 'Content-Type: application/json' \
  -d '{"kind":"hologram","serialFrom":"HOLO-1","serialTo":"HOLO-2","branchCode":"BR-01"}' | jq '.received'
curl -sS -X POST "$API/api/branch-ops/variances" -H 'Content-Type: application/json' \
  -d '{"agentCode":"A-1","agencyAmount":100,"branchAmount":80}' | jq '.item.variance,.item.direction'
```

Nav: **سایر → عملیات شعبه** → `/branch-ops`

## M1–M7 preserved
Branch from `feat/loyalty-m7` (6f22afc). Do not revert sales-network, sima-zar,
omid-pension, group-health, sanhab, dms, or loyalty core files — additive app.py routes + nav only.
