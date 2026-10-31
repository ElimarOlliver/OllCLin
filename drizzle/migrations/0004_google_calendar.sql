-- OllCLin — Migração 0004
-- Integração Google Calendar
--
-- Guarda, por usuário/organização, as credenciais OAuth2 necessárias para
-- criar/atualizar/excluir eventos no Google Calendar. Os tokens são gravados
-- CIFRADOS (AES-256-GCM) pela aplicação; o banco nunca recebe texto puro.
--
-- APLICAR NO SUPABASE (SQL Editor) OU VIA:
--   node scripts/pg-client.mjs --file drizzle/migrations/0004_google_calendar.sql
--
-- LGPD: acesso restrito ao backend (service role); exclusão em cascata quando
-- o usuário ou a organização é removido.

CREATE TABLE IF NOT EXISTS google_calendar_accounts (
  id                 bigserial PRIMARY KEY,
  organization_id    bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id        varchar(255) NOT NULL DEFAULT 'primary',
  access_token       text NOT NULL,                 -- cifrado (v1:...)
  refresh_token      text,                          -- cifrado (v1:...)
  token_expires_at   timestamptz,
  scope              text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_calendar_accounts_org_user_key UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_accounts_org
  ON google_calendar_accounts (organization_id);

-- Garante a coluna de vínculo do evento (idempotente).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_calendar_event_id varchar(255);

CREATE INDEX IF NOT EXISTS idx_appointments_google_event
  ON appointments (google_calendar_event_id);
