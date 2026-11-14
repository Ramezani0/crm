-- M4 درمان گروهی و معرفی‌نامه — Group Health & E-Referral (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/M1–M3 tables.
-- Eng-only: NO group-health Excel in n1–n21 (see ENG_MODULE_HANDOFF + MODULE_FORMULA_IMPORT_LOCKS).
-- Future import shape (when Excel arrives): policy_number, national_id, policyholder_code,
--   case_365 / پرونده_365, Jalali TEXT yyyy/mm/dd — no Gregorian.
-- product_code = 'group_health' (Eng-extension). Do NOT invent insurance_type outside locked
--   Import enum until Import map adds it; module tables own typed data; policies.insurance_type
--   stays nullable / untouched. Cite: ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md §2 enum.

CREATE TABLE IF NOT EXISTS gh_contracts (
  id                    BIGSERIAL PRIMARY KEY,
  contract_code         TEXT NOT NULL UNIQUE,
  employer_name         TEXT NOT NULL,
  policy_number         TEXT,
  national_id           TEXT,
  policyholder_code     TEXT,
  product_code          TEXT NOT NULL DEFAULT 'group_health',
  insurance_type        TEXT,
  start_date_jalali     TEXT,
  end_date_jalali       TEXT,
  issue_date_jalali     TEXT,
  franchise_pct         NUMERIC(8,4) NOT NULL DEFAULT 10,
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_system         TEXT NOT NULL DEFAULT 'fasihicrm',
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_contracts_product_chk CHECK (product_code = 'group_health'),
  CONSTRAINT gh_contracts_franchise_chk CHECK (franchise_pct >= 0 AND franchise_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_gh_contracts_policy_number ON gh_contracts (policy_number);
CREATE INDEX IF NOT EXISTS idx_gh_contracts_policyholder ON gh_contracts (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_gh_contracts_active ON gh_contracts (active) WHERE active IS TRUE;

CREATE TABLE IF NOT EXISTS gh_members (
  id                    BIGSERIAL PRIMARY KEY,
  contract_id           BIGINT NOT NULL REFERENCES gh_contracts(id),
  member_code           TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  national_id           TEXT,
  policyholder_code     TEXT,
  relation              TEXT NOT NULL DEFAULT 'self',
  enrollment_jalali     TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_members_status_chk CHECK (status IN ('active', 'removed', 'waiting')),
  CONSTRAINT gh_members_contract_code_uq UNIQUE (contract_id, member_code)
);

CREATE INDEX IF NOT EXISTS idx_gh_members_contract ON gh_members (contract_id);
CREATE INDEX IF NOT EXISTS idx_gh_members_nid ON gh_members (national_id);
CREATE INDEX IF NOT EXISTS idx_gh_members_status ON gh_members (status);

-- Ceiling / sublimit per member × benefit category
CREATE TABLE IF NOT EXISTS gh_benefit_ceilings (
  id                    BIGSERIAL PRIMARY KEY,
  member_id             BIGINT NOT NULL REFERENCES gh_members(id),
  category              TEXT NOT NULL,
  ceiling_rial          BIGINT NOT NULL,
  used_rial             BIGINT NOT NULL DEFAULT 0,
  remaining_rial        BIGINT NOT NULL,
  year_label            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_ceilings_cat_chk CHECK (
    category IN ('hospital', 'paraclinic', 'dental', 'maternity')
  ),
  CONSTRAINT gh_ceilings_nonneg_chk CHECK (
    ceiling_rial >= 0 AND used_rial >= 0 AND remaining_rial >= 0
  ),
  CONSTRAINT gh_ceilings_member_cat_uq UNIQUE (member_id, category)
);

CREATE INDEX IF NOT EXISTS idx_gh_ceilings_member ON gh_benefit_ceilings (member_id);

CREATE TABLE IF NOT EXISTS gh_referrals (
  id                    BIGSERIAL PRIMARY KEY,
  member_id             BIGINT NOT NULL REFERENCES gh_members(id),
  referral_type         TEXT NOT NULL,
  service_code          TEXT,
  franchise_pct         NUMERIC(8,4) NOT NULL,
  ceiling_remaining_rial BIGINT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'issued',
  issued_at_jalali      TEXT,
  notes                 TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_referrals_type_chk CHECK (referral_type IN ('hospital', 'paraclinic')),
  CONSTRAINT gh_referrals_status_chk CHECK (status IN ('issued', 'used', 'cancelled', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_gh_referrals_member ON gh_referrals (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gh_claims (
  id                    BIGSERIAL PRIMARY KEY,
  member_id             BIGINT NOT NULL REFERENCES gh_members(id),
  kind                  TEXT NOT NULL,
  service_code          TEXT,
  invoice_amount_rial   BIGINT NOT NULL,
  approved_tariff_rial  BIGINT,
  basic_share_rial      BIGINT NOT NULL DEFAULT 0,
  franchise_pct         NUMERIC(8,4) NOT NULL,
  franchise_rial        BIGINT NOT NULL DEFAULT 0,
  payout_rial           BIGINT NOT NULL DEFAULT 0,
  ceiling_remaining_before BIGINT,
  status                TEXT NOT NULL DEFAULT 'preview',
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_claims_kind_chk CHECK (kind IN ('outpatient', 'dental')),
  CONSTRAINT gh_claims_status_chk CHECK (
    status IN ('preview', 'registered', 'paid', 'rejected', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS idx_gh_claims_member ON gh_claims (member_id, created_at DESC);

-- DEMO California / relative-value tariff stub (few codes)
CREATE TABLE IF NOT EXISTS gh_tariff_stub (
  id                    BIGSERIAL PRIMARY KEY,
  service_code          TEXT NOT NULL UNIQUE,
  title_fa              TEXT NOT NULL,
  category              TEXT NOT NULL,
  approved_rial         BIGINT NOT NULL,
  relative_value        NUMERIC(10,4),
  source                TEXT NOT NULL DEFAULT 'DEMO_CALIFORNIA_STUB',
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_tariff_cat_chk CHECK (
    category IN ('hospital', 'paraclinic', 'dental', 'maternity', 'outpatient')
  )
);

CREATE TABLE IF NOT EXISTS gh_personnel_amendments (
  id                    BIGSERIAL PRIMARY KEY,
  contract_id           BIGINT NOT NULL REFERENCES gh_contracts(id),
  as_of_jalali          TEXT NOT NULL,
  adds_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
  removes_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
  adds_count            INT NOT NULL DEFAULT 0,
  removes_count         INT NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'stub_recorded',
  notes                 TEXT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_amend_status_chk CHECK (
    status IN ('stub_recorded', 'applied', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS idx_gh_amend_contract ON gh_personnel_amendments (contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gh_waiting_rules (
  id                    BIGSERIAL PRIMARY KEY,
  benefit               TEXT NOT NULL,
  waiting_days          INT NOT NULL,
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gh_waiting_benefit_chk CHECK (benefit IN ('maternity', 'surgery')),
  CONSTRAINT gh_waiting_days_chk CHECK (waiting_days >= 0),
  CONSTRAINT gh_waiting_benefit_uq UNIQUE (benefit)
);

-- Seed DEMO waiting rules if empty
INSERT INTO gh_waiting_rules (benefit, waiting_days, notes)
SELECT 'maternity', 270, 'DEMO stub — دوره انتظار زایمان (روز)'
WHERE NOT EXISTS (SELECT 1 FROM gh_waiting_rules WHERE benefit = 'maternity');

INSERT INTO gh_waiting_rules (benefit, waiting_days, notes)
SELECT 'surgery', 90, 'DEMO stub — دوره انتظار جراحی (روز)'
WHERE NOT EXISTS (SELECT 1 FROM gh_waiting_rules WHERE benefit = 'surgery');

-- Seed DEMO tariff rows if empty
INSERT INTO gh_tariff_stub (service_code, title_fa, category, approved_rial, relative_value)
SELECT * FROM (VALUES
  ('GH-H-100', 'بستری اتاق عمل عمومی', 'hospital', 45000000, 12.5000),
  ('GH-P-210', 'ام‌آرآی مغز', 'paraclinic', 8500000, 3.2000),
  ('GH-P-220', 'سونوگرافی شکم', 'paraclinic', 2200000, 0.8500),
  ('GH-D-310', 'جرم‌گیری دندان', 'dental', 1800000, 0.6000),
  ('GH-D-320', 'ترمیم کامپوزیت یک سطحی', 'dental', 3200000, 1.1000),
  ('GH-M-410', 'زایمان طبیعی', 'maternity', 65000000, 18.0000),
  ('GH-O-510', 'ویزیت متخصص', 'outpatient', 650000, 0.2500)
) AS v(service_code, title_fa, category, approved_rial, relative_value)
WHERE NOT EXISTS (SELECT 1 FROM gh_tariff_stub LIMIT 1);

COMMENT ON TABLE gh_contracts IS 'M4 group health contracts — product_code=group_health Eng-extension; insurance_type NOT in locked Import enum until map update';
COMMENT ON TABLE gh_members IS 'M4 insured personnel under group contracts';
COMMENT ON TABLE gh_benefit_ceilings IS 'M4 سقف تعهد per category — remaining = ceiling - used';
COMMENT ON TABLE gh_referrals IS 'M4 E-Referral hospital/paraclinic';
COMMENT ON TABLE gh_claims IS 'M4 outpatient/dental claims inbox — franchise + tariff DEMO';
COMMENT ON TABLE gh_tariff_stub IS 'DEMO California/relative-value book stub — replace before production';
COMMENT ON TABLE gh_personnel_amendments IS 'M4 الحاقیه لیست پرسنل — stub parse only; no CRM wipe';
COMMENT ON TABLE gh_waiting_rules IS 'M4 waiting days maternity/surgery DEMO stubs';
