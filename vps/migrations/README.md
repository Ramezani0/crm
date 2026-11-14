# VPS SQL migrations

Run manually against `fasihi-db` (no wipe). Prefer `ADD COLUMN IF NOT EXISTS`.

## 001_customers_holder_code.sql

Ensures `customers.holder_code TEXT` + partial index.

Value backfill (from «کد N» in `full_name`) is **not** in SQL — use:

- `python3 vps/backfill_holder_code.py` (dry-run)
- `python3 vps/backfill_holder_code.py --apply --yes`
- or `POST /api/admin/backfill-holder-code` with `{"dryRun":true}` then `{"dryRun":false}` + `X-Admin-Token`


## 002_sales_network_m1.sql

Creates `sales_agents`, `commission_rules`, `commission_settings` (idempotent).
In-memory seed in `vps/sales_network.py` works before SQL is applied.
DEMO_DEFAULTS rates — not legal. See `docs/SALES_NETWORK_M1.md`.

## 003_sima_zar_m2.sql

Creates `sima_zar_rates`, `sima_zar_positions`, `sima_zar_ledger` (idempotent).
In-memory store in `vps/sima_zar.py` works before SQL is applied.
DEMO stub rate — not live scrape. See `docs/SIMA_ZAR_M2.md`.
Loan always blocked (`loan_blocked = TRUE`).

## 004_omid_pension_m3.sql

Creates `omid_pension_plans`, `_beneficiaries`, `_schedules`, `_payouts`, `_pol_checks` (idempotent).
In-memory store in `vps/omid_pension.py` works before SQL is applied.
Import align: n5.xlsx `omid_retirement` — policy_number+national_id(+policyholder_code),
life_policy_meta (`first_year_end_reserve`, escalate %), case_365, Jalali TEXT.
Eng owns 10% compound / PoL / loan lock. Excel HOLD. See `docs/OMID_PENSION_M3.md`.

## 010_customer_documents.sql

Idempotent `customer_documents` (Import may already have rows). Volume `/opt/fasihi/documents`.
See `docs/P1_PERSIST_MERGE.md`.

## 011_audit_logs.sql

Site-wide `audit_logs` for API mutates (customers / installments / documents).
Application-level inserts; no wipe.
