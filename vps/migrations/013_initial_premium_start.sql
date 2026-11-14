-- Additive: start-of-policy first premium (Excel «بیمه‌نامه جدید» / حق بیمه اولیه).
-- Keep policies.initial_premium as latest endorsement IP (unchanged).
-- No wipe. Import backfills from n8 start-year rows.
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS initial_premium_start BIGINT;

COMMENT ON COLUMN policies.initial_premium_start IS
  'حق بیمه اولیه سال شروع (Excel) — P0 نردبان؛ جدا از initial_premium (آخرین الحاقیه)';
