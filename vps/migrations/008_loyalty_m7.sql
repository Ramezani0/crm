-- M7 Loyalty & Campaign — باشگاه مشتریان و جشنواره نمایندگان (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/M1–M6 tables.
-- Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
-- Future link keys: policy_number, policyholder_code, national_id.
-- Jalali TEXT yyyy/mm/dd — no Gregorian. Do NOT invent insurance_type outside locked Import enum.
-- Cite: ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
--       MODULE_FORMULA_IMPORT_LOCKS_20260924.md
-- DEMO stubs only.

CREATE TABLE IF NOT EXISTS loyalty_point_ledger (
  id                    BIGSERIAL PRIMARY KEY,
  policyholder_code     TEXT NOT NULL,
  national_id           TEXT,
  policy_number         TEXT,
  reason                TEXT NOT NULL,
  points                INTEGER NOT NULL,
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_ledger_reason_chk CHECK (
    reason IN ('early_pay', 'new_policy', 'referral')
  ),
  CONSTRAINT loyalty_ledger_points_chk CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_ph
  ON loyalty_point_ledger (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_reason
  ON loyalty_point_ledger (reason);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_policy
  ON loyalty_point_ledger (policy_number);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_nid
  ON loyalty_point_ledger (national_id);

CREATE TABLE IF NOT EXISTS loyalty_coupons (
  id                    BIGSERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  policyholder_code     TEXT NOT NULL,
  national_id           TEXT,
  policy_number         TEXT,
  rule_id               TEXT NOT NULL,
  trigger_policy_type   TEXT NOT NULL,
  coupon_insurance_type TEXT NOT NULL,
  discount_percent      INTEGER NOT NULL,
  label                 TEXT,
  status                TEXT NOT NULL DEFAULT 'issued',
  expires_jalali        TEXT,  -- yyyy/mm/dd TEXT — no Gregorian
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_coupons_discount_chk CHECK (
    discount_percent > 0 AND discount_percent <= 100
  ),
  CONSTRAINT loyalty_coupons_status_chk CHECK (
    status IN ('issued', 'redeemed', 'expired', 'cancelled')
  ),
  -- Locked Import enum subset for DEMO cross-sell (do not invent)
  CONSTRAINT loyalty_coupons_trigger_chk CHECK (
    trigger_policy_type IN ('universal_life', 'omid_retirement')
  ),
  CONSTRAINT loyalty_coupons_target_chk CHECK (
    coupon_insurance_type IN ('fire', 'fire_family')
  )
);

CREATE INDEX IF NOT EXISTS idx_loyalty_coupons_ph
  ON loyalty_coupons (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_coupons_status
  ON loyalty_coupons (status);
CREATE INDEX IF NOT EXISTS idx_loyalty_coupons_trigger
  ON loyalty_coupons (trigger_policy_type);

CREATE TABLE IF NOT EXISTS loyalty_campaigns (
  id                    BIGSERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  title                 TEXT NOT NULL,
  season                TEXT NOT NULL,
  starts_jalali         TEXT,  -- yyyy/mm/dd
  ends_jalali           TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_campaigns_season
  ON loyalty_campaigns (season);
CREATE INDEX IF NOT EXISTS idx_loyalty_campaigns_active
  ON loyalty_campaigns (active);

CREATE TABLE IF NOT EXISTS loyalty_agent_scores (
  id                    BIGSERIAL PRIMARY KEY,
  agent_code            TEXT NOT NULL,
  agent_name            TEXT,
  agency_code           TEXT,
  season                TEXT NOT NULL,
  campaign_code         TEXT,
  points                INTEGER NOT NULL DEFAULT 0,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_agent_scores_points_chk CHECK (points >= 0),
  CONSTRAINT loyalty_agent_scores_uniq UNIQUE (agent_code, season)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_scores_season_pts
  ON loyalty_agent_scores (season, points DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_scores_agency
  ON loyalty_agent_scores (agency_code);

COMMENT ON TABLE loyalty_point_ledger IS 'M7 portfolio points ledger (early_pay/new_policy/referral) — Eng-only DEMO';
COMMENT ON TABLE loyalty_coupons IS 'M7 cross-sell coupons stub — locked trigger/target insurance_type';
COMMENT ON TABLE loyalty_campaigns IS 'M7 seasonal festival campaign meta — Eng-only DEMO';
COMMENT ON TABLE loyalty_agent_scores IS 'M7 agent/agency festival scores for leaderboard — Eng-only DEMO';
