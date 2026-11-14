-- P1.2 soft-delete for customer_documents — additive only; no wipe.
-- Soft delete sets deleted_at; list excludes soft-deleted rows. Files on disk stay.

ALTER TABLE customer_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cdocs_deleted_at
  ON customer_documents (deleted_at)
  WHERE deleted_at IS NULL;
