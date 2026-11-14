# P1 Persist — DevOps merge notes

## What
Additive write-API durability after Import DONE + CoS GO:
- `customer_documents` + volume files under `DOCUMENTS_ROOT` (default `/opt/fasihi/documents`)
- `audit_logs` application-level inserts
- Customer PATCH (mobile / name / note) by policyholder_code → physical `holder_code`
- Installment payment POST
- Design / AppShell theme **HOLD**

## Column FACT (from `vps/app.py` + Import)
| Logical | Physical |
|---|---|
| policyholder_code | `customers.holder_code` (also match `customers.id`) |
| mobile | `customers.phone` |
| name | `customers.full_name` |
| note | `customers.note` |
| installment paid | `installments.paid_amount`, `paid_date` (Jalali TEXT), `payment_method`, `status` |
| source_system | **preserved** — never overwritten by UI/API |

`case_365` / Persian JSON: **untouched**. No DELETE/TRUNCATE from this module.

## Files
- `vps/persist.py`
- `vps/migrations/010_customer_documents.sql`
- `vps/migrations/011_audit_logs.sql`
- Wire in `vps/app.py` only (import + GET/PATCH/POST) — M1–M8 cores untouched
- Frontend: `src/lib/persist-api.ts`, `store.tsx` (API-first then optimistic), `src/routes/audit.tsx`
- Tests: `vps/test_persist.py`, `src/lib/persist-api.test.ts`
- Docs: this file

## Drop-in (if live `app.py` diverges)
1. Copy `/workspace/shared/fasihi-persist-p1.py` → VPS as `persist.py` next to `app.py`.
2. Apply `010` + `011` SQL (idempotent `CREATE IF NOT EXISTS`).
3. Bind-mount `/opt/fasihi/documents` (or set `DOCUMENTS_ROOT`).
4. In `app.py`:
   ```python
   try:
       import persist
   except ImportError:
       from vps import persist
   ```
5. Route patterns already documented in `persist.handle_request` meta:
   - `PATCH /api/customers/{policyholder_code}`
   - `POST /api/installments/payment`
   - `POST|GET /api/customer-documents[+/{id}[/file]]`
   - `GET /api/audit`

## VERIFY
```bash
cd vps && python3 -m unittest test_persist -v
bun test src/lib/persist-api.test.ts
# After migrate + deploy:
curl -sS "$API/api/persist/meta" | jq .
curl -sS -X PATCH "$API/api/customers/825221" -H 'Content-Type: application/json' \
  -d '{"note":"persist-p1","mobile":"09131234567"}' | jq '.ok,.sourceSystemPreserved'
curl -sS "$API/api/audit?table=customers&limit=5" | jq '.count'
```

## Locks
- Do **not** modify M1–M8 module cores or migrations `002`–`009`.
- Do **not** wipe DB / touch Import `case_365`.
- Web tar theme: **HOLD**.

## 2026-09-24 dossier edit + docs365
- Live `vps/documents.py` preferred for list/upload/soft-delete
- Nested `/api/customers/{key}/documents` + `POST /api/documents/{id}/delete`
- FE normalizes `C-K{holder}`
- Customer note/name/phone: PATCH only
- Design shell/theme/3D: untouched
