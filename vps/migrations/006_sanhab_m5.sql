-- M5 سنهاب / بیمه مرکزی — Regulatory Sanhab Connector (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/M1–M4 tables.
-- Eng-only for this Excel batch (ENG_MODULE_HANDOFF §4 Sanhab unique-code / VIN).
-- Future land shape: policy_number, computer_code, national_id, plate/VIN fields in
--   case_365 / پرونده_365, Jalali TEXT yyyy/mm/dd — no Gregorian.
-- Do NOT invent insurance_type outside locked Import enum.
-- Cite: ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
--       MODULE_FORMULA_IMPORT_LOCKS_20260924.md
-- NO real Sanhab network — DEMO stubs only.

CREATE TABLE IF NOT EXISTS sanhab_industry_ceiling_config (
  id                    BIGSERIAL PRIMARY KEY,
  ceiling_rial          BIGINT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'IRR',
  source                TEXT NOT NULL DEFAULT 'DEMO_CONFIG',
  notes                 TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sanhab_ceiling_nonneg_chk CHECK (ceiling_rial >= 0)
);

-- Keep a single active config row (latest wins for readers)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sanhab_ceiling_singleton
  ON sanhab_industry_ceiling_config ((TRUE));

INSERT INTO sanhab_industry_ceiling_config (ceiling_rial, notes)
SELECT 50000000000, 'سقف تجمیع سرمایه فوت صنعت — DEMO پیش‌فرض ۵۰ میلیارد ریال'
WHERE NOT EXISTS (SELECT 1 FROM sanhab_industry_ceiling_config LIMIT 1);

CREATE TABLE IF NOT EXISTS sanhab_inquiries (
  id                    BIGSERIAL PRIMARY KEY,
  kind                  TEXT NOT NULL,
  national_id           TEXT,
  plate                 TEXT,
  vin                   TEXT,
  policy_number         TEXT,
  computer_code         TEXT,
  known_sum_rial        BIGINT,
  proposed_capital_rial BIGINT,
  total_after_rial      BIGINT,
  ceiling_rial          BIGINT,
  over_limit            BOOLEAN,
  third_party_ncd_pct   NUMERIC(8,4),
  body_ncd_pct          NUMERIC(8,4),
  accident_history_count INT,
  manual_override       BOOLEAN NOT NULL DEFAULT FALSE,
  inquiry_jalali        TEXT,
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sanhab_inq_kind_chk CHECK (kind IN ('death_sum', 'vehicle'))
);

CREATE INDEX IF NOT EXISTS idx_sanhab_inq_nid ON sanhab_inquiries (national_id);
CREATE INDEX IF NOT EXISTS idx_sanhab_inq_plate ON sanhab_inquiries (plate);
CREATE INDEX IF NOT EXISTS idx_sanhab_inq_policy ON sanhab_inquiries (policy_number);
CREATE INDEX IF NOT EXISTS idx_sanhab_inq_kind ON sanhab_inquiries (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS sanhab_unique_codes (
  id                    BIGSERIAL PRIMARY KEY,
  unique_code           TEXT NOT NULL UNIQUE,
  policy_number         TEXT NOT NULL,
  computer_code         TEXT,
  plate                 TEXT,
  vin                   TEXT,
  -- insurance_type intentionally omitted / nullable — do NOT invent locked enum values
  insurance_type_hint   TEXT,
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  source                TEXT NOT NULL DEFAULT 'DEMO_SANHAB_STUB',
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sanhab_uc_format_chk CHECK (unique_code ~ '^SNH-[0-9]{8}-[A-F0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS idx_sanhab_uc_policy ON sanhab_unique_codes (policy_number);
CREATE INDEX IF NOT EXISTS idx_sanhab_uc_computer ON sanhab_unique_codes (computer_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sanhab_uc_policy_computer
  ON sanhab_unique_codes (policy_number, COALESCE(computer_code, ''));

CREATE TABLE IF NOT EXISTS sanhab_export_queue (
  id                    BIGSERIAL PRIMARY KEY,
  kind                  TEXT NOT NULL,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_number         TEXT,
  computer_code         TEXT,
  status                TEXT NOT NULL DEFAULT 'queued',
  batch_id              BIGINT,
  enqueued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exported_at           TIMESTAMPTZ,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT sanhab_eq_kind_chk CHECK (
    kind IN ('issuance', 'endorsement', 'financial_tx')
  ),
  CONSTRAINT sanhab_eq_status_chk CHECK (
    status IN ('queued', 'exported', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_sanhab_eq_status ON sanhab_export_queue (status, enqueued_at);
CREATE INDEX IF NOT EXISTS idx_sanhab_eq_policy ON sanhab_export_queue (policy_number);

CREATE TABLE IF NOT EXISTS sanhab_export_batches (
  id                    BIGSERIAL PRIMARY KEY,
  batch_code            TEXT NOT NULL UNIQUE,
  item_count            INT NOT NULL DEFAULT 0,
  json_path             TEXT,
  csv_path              TEXT,
  status                TEXT NOT NULL DEFAULT 'exported',
  network_call          BOOLEAN NOT NULL DEFAULT FALSE,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sanhab_eb_status_chk CHECK (
    status IN ('exported', 'failed', 'pending')
  )
);

-- Optional FK from queue → batch (nullable until export)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sanhab_eq_batch_fk'
  ) THEN
    ALTER TABLE sanhab_export_queue
      ADD CONSTRAINT sanhab_eq_batch_fk
      FOREIGN KEY (batch_id) REFERENCES sanhab_export_batches(id);
  END IF;
END $$;

COMMENT ON TABLE sanhab_industry_ceiling_config IS 'M5 DEMO configurable industry death-capital ceiling (rial)';
COMMENT ON TABLE sanhab_inquiries IS 'M5 death-sum / vehicle Sanhab inquiry stubs — no network';
COMMENT ON TABLE sanhab_unique_codes IS 'M5 کد یکتا assigned onto auto policy by policy_number/computer_code';
COMMENT ON TABLE sanhab_export_queue IS 'M5 periodic issuance/endorsement/financial_tx export queue';
COMMENT ON TABLE sanhab_export_batches IS 'M5 export bundle metadata (JSON/CSV paths under stub dir)';
