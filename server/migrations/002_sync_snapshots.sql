-- Telvyo encrypted cloud backup foundation. Apply AFTER 001_privacy_consent.sql.
-- Table contains pseudonymous account keys and opaque AES-256-GCM ciphertext only.
BEGIN;
CREATE SCHEMA IF NOT EXISTS telvyo;
CREATE TABLE IF NOT EXISTS telvyo.sync_snapshots (
  account_key CHAR(64) PRIMARY KEY CHECK (account_key ~ '^[a-f0-9]{64}$'),
  revision BIGINT NOT NULL CHECK (revision > 0),
  snapshot BYTEA CHECK (snapshot IS NULL OR octet_length(snapshot) <= 262144),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Expand consent purposes without weakening the validated AI-specific flow.
ALTER TABLE telvyo.consent_events
  DROP CONSTRAINT IF EXISTS consent_events_purpose_check;
ALTER TABLE telvyo.consent_events
  ADD CONSTRAINT consent_events_purpose_check
  CHECK (purpose IN ('ai-advisor', 'cloud-sync'));

-- A dedicated least-privilege runtime role must only get SELECT, INSERT, UPDATE
-- for sync_snapshots, SELECT/INSERT/DELETE on consent_events and sequence USAGE.
COMMIT;
