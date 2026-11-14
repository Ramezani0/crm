-- Ensure customers.holder_code exists (TEXT). Idempotent. NO wipe / NO DELETE.
-- Backfill of values is done by vps/backfill_holder_code.py or
-- POST /api/admin/backfill-holder-code (dry-run default; apply needs ADMIN_TOKEN).

ALTER TABLE customers ADD COLUMN IF NOT EXISTS holder_code TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_holder_code
  ON customers (holder_code)
  WHERE holder_code IS NOT NULL AND BTRIM(holder_code) <> '';
