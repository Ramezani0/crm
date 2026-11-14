-- M2 سیما زر — gold savings positions / rates / ledger (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments.

CREATE TABLE IF NOT EXISTS sima_zar_rates (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL DEFAULT 'GOB1CD0001',
  rial_per_gram   NUMERIC(20,4) NOT NULL,
  source          TEXT NOT NULL DEFAULT 'DEMO_STUB',
  as_of           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sima_zar_rates_symbol_asof
  ON sima_zar_rates (symbol, as_of DESC);

CREATE TABLE IF NOT EXISTS sima_zar_positions (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     BIGINT,
  customer_label  TEXT,
  milligrams      NUMERIC(20,6) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  loan_blocked    BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sima_zar_positions_status_chk CHECK (
    status IN ('active', 'closed')
  ),
  CONSTRAINT sima_zar_positions_mg_chk CHECK (milligrams >= 0),
  CONSTRAINT sima_zar_positions_loan_blocked_chk CHECK (loan_blocked IS TRUE)
);

CREATE INDEX IF NOT EXISTS idx_sima_zar_positions_customer
  ON sima_zar_positions (customer_id);

CREATE INDEX IF NOT EXISTS idx_sima_zar_positions_active
  ON sima_zar_positions (status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS sima_zar_ledger (
  id                    BIGSERIAL PRIMARY KEY,
  position_id           BIGINT NOT NULL REFERENCES sima_zar_positions(id),
  kind                  TEXT NOT NULL,
  milligrams            NUMERIC(20,6) NOT NULL DEFAULT 0,
  rial                  BIGINT NOT NULL DEFAULT 0,
  rate_rial_per_gram    NUMERIC(20,4),
  meta                  JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sima_zar_ledger_kind_chk CHECK (
    kind IN ('deposit', 'fee_entry', 'withdraw', 'fee_exit')
  )
);

CREATE INDEX IF NOT EXISTS idx_sima_zar_ledger_position
  ON sima_zar_ledger (position_id, created_at);

-- Seed one DEMO stub rate if empty
INSERT INTO sima_zar_rates (symbol, rial_per_gram, source, notes)
SELECT
  'GOB1CD0001',
  35000000,
  'DEMO_STUB',
  'DEMO stub — not live scrape. Replace before production.'
WHERE NOT EXISTS (SELECT 1 FROM sima_zar_rates LIMIT 1);

COMMENT ON TABLE sima_zar_rates IS 'M2 سیما زر daily/stub rates — DEMO_STUB until live feed';
COMMENT ON TABLE sima_zar_positions IS 'M2 سیما زر gold positions; loan_blocked always true';
COMMENT ON TABLE sima_zar_ledger IS 'M2 ledger: deposit, fee_entry, withdraw, fee_exit';
