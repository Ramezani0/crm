-- M6 DMS بایگانی — Document Management & Physical Archive (skeleton)
-- Idempotent. NO wipe / NO DELETE of customers/policies/installments/M1–M5 tables.
-- Eng-only for this Excel batch (MODULE_FORMULA_IMPORT_LOCKS: Sanhab/DMS/Loyalty/Branch).
-- Future link keys: policy_number, policyholder_code, national_id, case_365 / پرونده_365.
-- Jalali TEXT yyyy/mm/dd — no Gregorian. Do NOT invent insurance_type outside locked Import enum.
-- Cite: ENG_MODULE_HANDOFF_FROM_IMPORT_20260924.md
--       MODULE_FORMULA_IMPORT_LOCKS_20260924.md
-- NO real biometrics / NO real ML OCR — DEMO stubs only.

CREATE TABLE IF NOT EXISTS archive_locations (
  id                    BIGSERIAL PRIMARY KEY,
  dossier_key           TEXT NOT NULL,
  barcode               TEXT NOT NULL UNIQUE,
  qr_payload            TEXT NOT NULL,
  branch                TEXT NOT NULL,
  shelf                 TEXT NOT NULL,
  row_label             TEXT NOT NULL,  -- "row" is reserved-ish; use row_label
  binder                TEXT NOT NULL,  -- زونکن
  policy_number         TEXT,
  policyholder_code     TEXT,
  national_id           TEXT,
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT archive_barcode_format_chk CHECK (
    barcode ~ '^DMS-BR[A-Z0-9]+-SH[A-Z0-9]+-RW[A-Z0-9]+-BN[A-Z0-9]+-[A-F0-9]{8}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_dossier_key
  ON archive_locations (dossier_key);
CREATE INDEX IF NOT EXISTS idx_archive_barcode ON archive_locations (barcode);
CREATE INDEX IF NOT EXISTS idx_archive_policy ON archive_locations (policy_number);
CREATE INDEX IF NOT EXISTS idx_archive_ph_code ON archive_locations (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_archive_nid ON archive_locations (national_id);

CREATE TABLE IF NOT EXISTS documents (
  id                    BIGSERIAL PRIMARY KEY,
  dossier_key           TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  title                 TEXT,
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_hash         TEXT NOT NULL,
  hash_algo             TEXT NOT NULL DEFAULT 'sha256',
  policy_number         TEXT,
  policyholder_code     TEXT,
  national_id           TEXT,
  case_365              JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed                BOOLEAN NOT NULL DEFAULT FALSE,
  signature_id          BIGINT,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_kind_chk CHECK (
    kind IN (
      'proposal',
      'national_id_card',
      'birth_certificate',
      'health_booklet',
      'accident_sketch',
      'other'
    )
  ),
  CONSTRAINT documents_hash_algo_chk CHECK (hash_algo = 'sha256'),
  CONSTRAINT documents_hash_len_chk CHECK (char_length(document_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_documents_dossier ON documents (dossier_key);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents (document_hash);
CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents (kind);
CREATE INDEX IF NOT EXISTS idx_documents_policy ON documents (policy_number);
CREATE INDEX IF NOT EXISTS idx_documents_ph_code ON documents (policyholder_code);
CREATE INDEX IF NOT EXISTS idx_documents_nid ON documents (national_id);

CREATE TABLE IF NOT EXISTS signatures (
  id                    BIGSERIAL PRIMARY KEY,
  document_id           BIGINT NOT NULL REFERENCES documents (id),
  method                TEXT NOT NULL,
  payload_stub          JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_hash         TEXT NOT NULL,
  hash_algo             TEXT NOT NULL DEFAULT 'sha256',
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  real_biometrics       BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT signatures_method_chk CHECK (method IN ('touch', 'fingerprint')),
  CONSTRAINT signatures_hash_algo_chk CHECK (hash_algo = 'sha256'),
  CONSTRAINT signatures_hash_len_chk CHECK (char_length(document_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures (document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_hash ON signatures (document_hash);

-- Back-reference documents.signature_id → signatures (soft; added after both exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_signature_fk'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_signature_fk
      FOREIGN KEY (signature_id) REFERENCES signatures (id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
EXCEPTION WHEN others THEN
  -- keep idempotent if FK already present or engine differs
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS ocr_jobs (
  id                    BIGSERIAL PRIMARY KEY,
  doc_type              TEXT NOT NULL,
  image_meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  stub_text             TEXT,
  status                TEXT NOT NULL DEFAULT 'done',
  mapped_fields         JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine                TEXT NOT NULL DEFAULT 'DEMO_STUB_MAP',
  real_ml               BOOLEAN NOT NULL DEFAULT FALSE,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  CONSTRAINT ocr_doc_type_chk CHECK (
    doc_type IN (
      'national_id_card',
      'birth_certificate',
      'health_booklet',
      'accident_sketch'
    )
  ),
  CONSTRAINT ocr_status_chk CHECK (status IN ('queued', 'running', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_type ON ocr_jobs (doc_type);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS document_hashes (
  id                    BIGSERIAL PRIMARY KEY,
  document_id           BIGINT NOT NULL REFERENCES documents (id),
  hash_algo             TEXT NOT NULL DEFAULT 'sha256',
  document_hash         TEXT NOT NULL,
  canonical_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  demo_stub             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_hashes_algo_chk CHECK (hash_algo = 'sha256'),
  CONSTRAINT document_hashes_len_chk CHECK (char_length(document_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_document_hashes_doc ON document_hashes (document_id);
CREATE INDEX IF NOT EXISTS idx_document_hashes_hash ON document_hashes (document_hash);

COMMENT ON TABLE archive_locations IS 'M6 physical archive barcode/QR warehouse address — Eng-only DEMO';
COMMENT ON TABLE documents IS 'M6 proposal/docs with SHA-256 canonical hash — Eng-only DEMO';
COMMENT ON TABLE signatures IS 'M6 e-sign/fingerprint STUB (no real biometrics) attached to document hash';
COMMENT ON TABLE ocr_jobs IS 'M6 Persian OCR STUB map — no real ML';
COMMENT ON TABLE document_hashes IS 'M6 tamper-evident hash ledger for documents';
