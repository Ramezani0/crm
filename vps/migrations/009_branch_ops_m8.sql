-- M8 Branch Operations — کارتابل شعب / عملیات نمایندگی (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/M1–M7 tables.
-- Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
-- Serial numbers DEMO. Jalali TEXT yyyy/mm/dd — no Gregorian.
-- Cite: ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
--       MODULE_FORMULA_IMPORT_LOCKS_20260924.md
-- DEMO stubs only.

CREATE TABLE IF NOT EXISTS paper_stock (
  id                    BIGSERIAL PRIMARY KEY,
  serial                TEXT NOT NULL UNIQUE,
  kind                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'received_from_branch',
  branch_code           TEXT,
  agency_code           TEXT,
  policy_number         TEXT,
  void_reason           TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_stock_kind_chk CHECK (
    kind IN ('receipt', 'policy_sheet', 'hologram')
  ),
  CONSTRAINT paper_stock_status_chk CHECK (
    status IN ('received_from_branch', 'assigned_to_issue', 'issued', 'voided')
  )
);

CREATE INDEX IF NOT EXISTS idx_paper_stock_kind ON paper_stock (kind);
CREATE INDEX IF NOT EXISTS idx_paper_stock_status ON paper_stock (status);
CREATE INDEX IF NOT EXISTS idx_paper_stock_branch ON paper_stock (branch_code);
CREATE INDEX IF NOT EXISTS idx_paper_stock_policy ON paper_stock (policy_number);

CREATE TABLE IF NOT EXISTS paper_movements (
  id                    BIGSERIAL PRIMARY KEY,
  serial                TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  action                TEXT NOT NULL,
  from_status           TEXT,
  to_status             TEXT NOT NULL,
  policy_number         TEXT,
  reason                TEXT,
  branch_code           TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_movements_action_chk CHECK (
    action IN ('receive', 'assign', 'issue', 'void',
               'received_from_branch', 'assigned_to_issue', 'issued', 'voided')
  )
);

CREATE INDEX IF NOT EXISTS idx_paper_movements_serial ON paper_movements (serial);
CREATE INDEX IF NOT EXISTS idx_paper_movements_created ON paper_movements (created_at DESC);

CREATE TABLE IF NOT EXISTS commission_variances (
  id                    BIGSERIAL PRIMARY KEY,
  agent_code            TEXT NOT NULL,
  agency_amount         BIGINT NOT NULL,
  branch_amount         BIGINT NOT NULL,
  variance              BIGINT NOT NULL,
  direction             TEXT NOT NULL,
  note                  TEXT,
  period_jalali         TEXT,  -- e.g. 1404/06 TEXT — no Gregorian
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT commission_variances_direction_chk CHECK (
    direction IN ('agency_higher', 'branch_higher', 'matched')
  )
);

CREATE INDEX IF NOT EXISTS idx_commission_variances_agent
  ON commission_variances (agent_code);
CREATE INDEX IF NOT EXISTS idx_commission_variances_period
  ON commission_variances (period_jalali);

CREATE TABLE IF NOT EXISTS incoming_checks (
  id                    BIGSERIAL PRIMARY KEY,
  check_number          TEXT NOT NULL UNIQUE,
  amount_rial           BIGINT NOT NULL,
  bank_name             TEXT,
  policyholder_code     TEXT,
  policy_number         TEXT,
  due_jalali            TEXT,  -- yyyy/mm/dd TEXT
  status                TEXT NOT NULL DEFAULT 'received',
  note                  TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incoming_checks_amount_chk CHECK (amount_rial > 0),
  CONSTRAINT incoming_checks_status_chk CHECK (
    status IN ('received', 'deposited', 'cleared', 'bounced', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_incoming_checks_status ON incoming_checks (status);
CREATE INDEX IF NOT EXISTS idx_incoming_checks_ph ON incoming_checks (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_incoming_checks_due ON incoming_checks (due_jalali);

COMMENT ON TABLE paper_stock IS 'M8 security paper inventory (receipt/policy_sheet/hologram) — Eng-only DEMO';
COMMENT ON TABLE paper_movements IS 'M8 paper lifecycle movements — Eng-only DEMO';
COMMENT ON TABLE commission_variances IS 'M8 agency vs branch kartabl commission variance — Eng-only DEMO';
COMMENT ON TABLE incoming_checks IS 'M8 policyholder incoming checks stub — Eng-only DEMO';
