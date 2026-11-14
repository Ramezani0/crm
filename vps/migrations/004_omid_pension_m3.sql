-- M3 امید بازنشستگی — Omid Pension plans / schedules / payouts / beneficiaries / PoL
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/sima_zar/sales_network.
-- Import align: n5.xlsx omid_retirement — see
--   /workspace/shared/ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
--   /workspace/shared/MODULE_FORMULA_IMPORT_LOCKS_20260924.md
-- Jalali dates stored as TEXT yyyy/mm/dd — no Gregorian conversion.
-- Eng owns: 10% compound schedule, PoL stub, loan/surrender lock in payout.
-- Import does NOT recompute historical premiums.

CREATE TABLE IF NOT EXISTS omid_pension_plans (
  id                      BIGSERIAL PRIMARY KEY,
  customer_id             BIGINT,
  customer_label          TEXT,
  policy_number           TEXT,
  national_id             TEXT,
  policyholder_code       TEXT,
  insurance_type          TEXT NOT NULL DEFAULT 'omid_retirement',
  issue_date_jalali       TEXT,
  start_date_jalali       TEXT,
  end_date_jalali         TEXT,
  retirement_age          INT NOT NULL DEFAULT 55,
  accumulation_years      INT NOT NULL DEFAULT 10,
  accumulation_rial       BIGINT NOT NULL DEFAULT 0,
  initial_monthly_rial    BIGINT NOT NULL DEFAULT 0,
  first_year_end_reserve  NUMERIC(20,2),
  premium_escalate_pct    NUMERIC(8,4),
  sum_insured_escalate_pct NUMERIC(8,4),
  life_policy_meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  phase                   TEXT NOT NULL DEFAULT 'accumulation',
  loan_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  surrender_blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  alive                   BOOLEAN NOT NULL DEFAULT TRUE,
  death_at                TIMESTAMPTZ,
  transition_at           TIMESTAMPTZ,
  current_year_index      INT NOT NULL DEFAULT 0,
  current_month_index     INT NOT NULL DEFAULT 0,
  case_365                JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_system           TEXT NOT NULL DEFAULT 'fasihicrm',
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT omid_pension_plans_phase_chk CHECK (
    phase IN ('accumulation', 'guaranteed_10y', 'lifetime')
  ),
  CONSTRAINT omid_pension_plans_age_chk CHECK (
    retirement_age BETWEEN 50 AND 61
  ),
  CONSTRAINT omid_pension_plans_type_chk CHECK (
    insurance_type = 'omid_retirement'
  )
);

CREATE INDEX IF NOT EXISTS idx_omid_pension_plans_policy_number
  ON omid_pension_plans (policy_number);
CREATE INDEX IF NOT EXISTS idx_omid_pension_plans_national_id
  ON omid_pension_plans (national_id);
CREATE INDEX IF NOT EXISTS idx_omid_pension_plans_policyholder_code
  ON omid_pension_plans (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_omid_pension_plans_phase
  ON omid_pension_plans (phase);

CREATE TABLE IF NOT EXISTS omid_pension_beneficiaries (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES omid_pension_plans(id),
  name            TEXT NOT NULL,
  national_id     TEXT,
  relation        TEXT,
  share_pct       NUMERIC(8,4) NOT NULL DEFAULT 100,
  stub            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omid_pension_beneficiaries_plan
  ON omid_pension_beneficiaries (plan_id);

CREATE TABLE IF NOT EXISTS omid_pension_schedules (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES omid_pension_plans(id),
  month_index     INT NOT NULL,
  year_index      INT NOT NULL,
  phase           TEXT NOT NULL,
  amount_rial     BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  due_label       TEXT,
  paid_at         TIMESTAMPTZ,
  payee           TEXT NOT NULL DEFAULT 'annuitant',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT omid_pension_schedules_phase_chk CHECK (
    phase IN ('guaranteed_10y', 'lifetime')
  ),
  CONSTRAINT omid_pension_schedules_status_chk CHECK (
    status IN ('scheduled', 'paid', 'skipped', 'beneficiary', 'stopped')
  ),
  CONSTRAINT omid_pension_schedules_uniq UNIQUE (plan_id, month_index)
);

CREATE INDEX IF NOT EXISTS idx_omid_pension_schedules_plan
  ON omid_pension_schedules (plan_id, month_index);

CREATE TABLE IF NOT EXISTS omid_pension_payouts (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES omid_pension_plans(id),
  schedule_id     BIGINT REFERENCES omid_pension_schedules(id),
  year_index      INT NOT NULL,
  month_index     INT NOT NULL,
  amount_rial     BIGINT NOT NULL,
  payee           TEXT NOT NULL DEFAULT 'annuitant',
  proof_of_life_id BIGINT,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omid_pension_payouts_plan
  ON omid_pension_payouts (plan_id, created_at);

CREATE TABLE IF NOT EXISTS omid_pension_pol_checks (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES omid_pension_plans(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  method          TEXT NOT NULL DEFAULT 'TODO_SMS_OR_SABTAHVAL',
  checked_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT omid_pension_pol_status_chk CHECK (
    status IN ('pending', 'confirmed', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_omid_pension_pol_plan
  ON omid_pension_pol_checks (plan_id, created_at DESC);

COMMENT ON TABLE omid_pension_plans IS
  'M3 امید بازنشستگی; link policy_number+national_id(+policyholder_code); life_policy_meta from n5; Jalali TEXT';
COMMENT ON COLUMN omid_pension_plans.case_365 IS
  'پرونده_365 / case_365 — original Persian Excel keys; Import overflow';
COMMENT ON COLUMN omid_pension_plans.first_year_end_reserve IS
  'n5 اندوخته پایان سال اول — land as-is; Eng DEMO may seed accumulation';
COMMENT ON COLUMN omid_pension_plans.issue_date_jalali IS
  'Jalali TEXT yyyy/mm/dd — no Gregorian conversion';
COMMENT ON TABLE omid_pension_schedules IS
  'Eng-owned 10% compound payout schedule — Import will NOT compute';
COMMENT ON TABLE omid_pension_pol_checks IS
  'Proof of Life stub; SMS/SabtAhval TODO; blocks schedule advance unless confirmed';
