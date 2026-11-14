-- P1.1 customer_documents — idempotent; no wipe.
-- See docs/P1_PERSIST_MERGE.md · ENG_P1_PERSIST_PREP_20260924.md
-- NOTE: Import may already have this table (CREATE IF NOT EXISTS is safe).

CREATE TABLE IF NOT EXISTS customer_documents (
  id                    BIGSERIAL PRIMARY KEY,
  policyholder_code     TEXT,
  national_id           TEXT,
  policy_number         TEXT,
  computer_code         TEXT,
  installment_key       TEXT,
  category              TEXT NOT NULL,
  file_title            TEXT NOT NULL,
  storage_path          TEXT NOT NULL,
  mime_type             TEXT NOT NULL,
  file_size_bytes       BIGINT NOT NULL DEFAULT 0,
  sha256_checksum       CHAR(64) NOT NULL,
  uploaded_by           TEXT,
  source_system         TEXT NOT NULL DEFAULT 'fasihicrm',
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_documents_sha_chk CHECK (char_length(sha256_checksum) = 64)
);

CREATE INDEX IF NOT EXISTS idx_cdocs_ph ON customer_documents (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_cdocs_policy ON customer_documents (policy_number);
CREATE INDEX IF NOT EXISTS idx_cdocs_nid ON customer_documents (national_id);
CREATE INDEX IF NOT EXISTS idx_cdocs_sha ON customer_documents (sha256_checksum);
