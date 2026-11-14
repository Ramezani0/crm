# Loyalty M7 — DevOps merge notes

## What
Skeleton for باشگاه / جشنواره: portfolio points (early_pay / new_policy / referral),
cross-sell fire 20% coupon stub on universal_life / omid_retirement purchase,
agent festival leaderboard.
**DEMO rates configurable. No Excel wipe. No invented insurance_type.**

## Handoff locks (cite)
- `/workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md`
- `/workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md` (Sanhab/DMS/Loyalty/Branch = Eng-only)
- Brief module 7: `KARAFARIN_CORE_MODULES_BRIEF_20260924.md`
- Research: `insurance-crm-modules-gemini-20260924.txt` (~3693–3700)

Loyalty is Eng-module-only for this Excel batch. Accept future link keys:
`policy_number`, `policyholder_code`, `national_id`.
Do **not** invent locked `insurance_type` values.
Coupon triggers DEMO: `universal_life`, `omid_retirement` → target `fire`.

## Files in repo (branch `feat/loyalty-m7`)
- `vps/loyalty.py`
- `vps/migrations/008_loyalty_m7.sql`
- Wire in `vps/app.py` (import + GET/POST `/api/loyalty*`) — additive only
- Frontend: `src/routes/loyalty.tsx`, nav «باشگاه» in `app-shell.tsx` secondary
- Docs: `docs/LOYALTY_M7.md`
- Tests: `vps/test_loyalty.py`, `src/lib/loyalty.test.ts`

## Drop-in (if live `app.py` diverges)
1. Copy `/workspace/shared/fasihi-loyalty-m7.py` → VPS as `loyalty.py` next to `app.py`.
2. In `app.py`:
   ```python
   try:
       import loyalty
   except ImportError:
       from vps import loyalty
   ```
3. In `do_GET` / `do_POST`: if `path.startswith("/api/loyalty")` → `loyalty.handle_request(...)`.
4. Optional: apply `008_loyalty_m7.sql` (module works in-memory without it).

## Web deploy
**HOLD** — do not ship web tar unless CoS lifts HOLD.

## VERIFY
```bash
cd vps && python3 -m unittest test_loyalty -v
bun test src/lib/loyalty.test.ts
curl -sS "$API/api/loyalty/meta" | jq '.ok,.rates,.lockedTriggerTypes'
curl -sS "$API/api/loyalty/balance?policyholderCode=100200" | jq '.balance'
curl -sS -X POST "$API/api/loyalty/earn" -H 'Content-Type: application/json' \
  -d '{"reason":"early_pay","policyholderCode":"PH1","paidDateJalali":"1404/06/01","dueDateJalali":"1404/06/10"}' | jq '.points,.balance'
curl -sS -X POST "$API/api/loyalty/coupons/issue" -H 'Content-Type: application/json' \
  -d '{"triggerPolicyType":"universal_life","policyholderCode":"PH1"}' | jq '.coupon.code,.coupon.discountPercent'
curl -sS "$API/api/loyalty/festival" | jq '.leaderboard[0]'
```

Nav: **سایر → باشگاه** → `/loyalty`

## M1–M6 preserved
Branch from `feat/dms-m6` (88e093d). Do not revert sales-network, sima-zar,
omid-pension, group-health, sanhab, or dms core files — additive app.py routes + nav only.
