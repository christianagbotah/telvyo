-- Telvyo private customer-consent ledger.
-- Run only in a dedicated, access-controlled database with migrations approved.
-- No raw email, carrier number, phone identifiers or OIDC subject is stored.
BEGIN;
CREATE SCHEMA IF NOT EXISTS telvyo;

CREATE TABLE IF NOT EXISTS telvyo.consent_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_key CHAR(64) NOT NULL CHECK (account_key ~ '^[a-f0-9]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose IN ('ai-advisor')),
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL CHECK (char_length(policy_version) BETWEEN 1 AND 40),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS consent_events_latest
  ON telvyo.consent_events (account_key, purpose, id DESC);

-- Use a dedicated, least-privilege runtime role that has only
-- SELECT, INSERT and DELETE on the consent table and USAGE on its sequence.
COMMIT;
