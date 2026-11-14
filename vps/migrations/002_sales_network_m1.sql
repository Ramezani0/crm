-- M1 Agent Hierarchy & Multi-tier Commission (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments.

CREATE TABLE IF NOT EXISTS sales_agents (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  full_name       TEXT NOT NULL,
  parent_id       BIGINT REFERENCES sales_agents(id) ON DELETE SET NULL,
  role            TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  phone           TEXT,
  national_id     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_agents_role_chk CHECK (
    role IN ('general', 'ayeen96', 'broker', 'development_manager', 'marketer')
  )
);

CREATE INDEX IF NOT EXISTS idx_sales_agents_parent
  ON sales_agents (parent_id);

CREATE INDEX IF NOT EXISTS idx_sales_agents_active
  ON sales_agents (active)
  WHERE active IS TRUE;

CREATE TABLE IF NOT EXISTS commission_rules (
  id                    BIGSERIAL PRIMARY KEY,
  kind                  TEXT NOT NULL,
  policy_year           SMALLINT NOT NULL,
  rate_pct              NUMERIC(8,4) NOT NULL,
  withholding_tax_pct   NUMERIC(8,4),
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commission_rules_kind_chk CHECK (
    kind IN ('issuance', 'collection', 'supervisory')
  ),
  CONSTRAINT commission_rules_year_chk CHECK (
    policy_year BETWEEN 1 AND 5
  ),
  CONSTRAINT commission_rules_unique UNIQUE (kind, policy_year)
);

-- Optional global withholding default when row-level withholding_tax_pct is NULL
CREATE TABLE IF NOT EXISTS commission_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  notes TEXT
);

INSERT INTO commission_settings (key, value, notes)
VALUES (
  'withholding_tax_pct',
  '10',
  'DEMO_DEFAULTS — placeholder, not legal rates. Replace before production.'
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE sales_agents IS 'M1 sales network tree — agency 3045';
COMMENT ON TABLE commission_rules IS 'DEMO_DEFAULTS rates — not legal/actuarial; replace before production';
