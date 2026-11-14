-- P1.2 audit_logs — TEXT record keys for Fasihi PKs.
-- Application-level audit; never DELETE/TRUNCATE from API.
-- See docs/P1_PERSIST_MERGE.md · ENG_P1_PERSIST_PREP_20260924.md

CREATE TABLE IF NOT EXISTS audit_logs (
  id                BIGSERIAL PRIMARY KEY,
  table_name        TEXT NOT NULL,
  record_id         TEXT NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data          JSONB,
  new_data          JSONB,
  changed_fields    JSONB,
  performed_by      TEXT,
  client_ip         TEXT,
  user_agent        TEXT,
  reason            TEXT,
  source            TEXT NOT NULL DEFAULT 'api',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (performed_by);
