-- OllCLin — Migração 0003
-- Módulos: Financeiro > Vendas (Cap. 15.1.2)
--          Financeiro > Repasse (Cap. 15.3)
--          Financeiro > Extrato (Cap. 15.4)
--          Financeiro > Recibos (Cap. 15.5)
-- Banco: Supabase (PostgreSQL). Isolamento por organization_id.
--
-- APLICAR NO SUPABASE (SQL Editor) OU VIA:
--   node scripts/pg-client.mjs --file drizzle/migrations/0003_financeiro_completo.sql

/* -------------------------------------------------------------------------- */
/*  APOIO AO REPASSE                                                          */
/*  Receitas passam a registrar profissional e local do atendimento para que   */
/*  o módulo Repasse consiga filtrar por ambos (Cap. 15.3.1).                  */
/* -------------------------------------------------------------------------- */
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS professional_id bigint REFERENCES professionals(id) ON DELETE SET NULL;
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS location_id bigint REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rev_org_prof_idx ON revenues (organization_id, professional_id);
CREATE INDEX IF NOT EXISTS rev_org_loc_idx ON revenues (organization_id, location_id);

-- Backfill a partir do agendamento quando existir
UPDATE revenues r
SET professional_id = COALESCE(r.professional_id, a.professional_id),
    location_id = COALESCE(r.location_id, a.location_id)
FROM appointments a
WHERE r.appointment_id = a.id
  AND (r.professional_id IS NULL OR r.location_id IS NULL);

-- Percentual de repasse configurado por profissional (Cap. 15.3.1)
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS commission_percentage numeric(5,2) NOT NULL DEFAULT 0
  CHECK (commission_percentage >= 0 AND commission_percentage <= 100);

/* -------------------------------------------------------------------------- */
/*  VENDAS (Cap. 15.1.2)                                                      */
/*  Cabeçalho + linhas (procedimentos). Status: a_receber | recebido | cancelada */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS sales (
  id                bigserial PRIMARY KEY,
  organization_id   bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id        bigint REFERENCES patients(id) ON DELETE SET NULL,
  payer_name        varchar(255),
  health_plan_id    bigint REFERENCES health_plans(id) ON DELETE SET NULL,
  payment_method_id bigint REFERENCES payment_methods(id) ON DELETE SET NULL,
  location_id       bigint REFERENCES locations(id) ON DELETE SET NULL,
  professional_id   bigint REFERENCES professionals(id) ON DELETE SET NULL,
  installment_no    int NOT NULL DEFAULT 1,
  installments_total int NOT NULL DEFAULT 1,
  amount            numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status            varchar(20) NOT NULL DEFAULT 'a_receber', -- a_receber | recebido | cancelada
  issued_at         date NOT NULL DEFAULT CURRENT_DATE,
  received_at       timestamptz,
  description       text,
  attachment_url    varchar(500),
  created_by        bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_org_idx ON sales (organization_id);
CREATE INDEX IF NOT EXISTS sale_org_status_idx ON sales (organization_id, status);
CREATE INDEX IF NOT EXISTS sale_org_issued_idx ON sales (organization_id, issued_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id            bigserial PRIMARY KEY,
  sale_id       bigint NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  procedure_id  bigint REFERENCES procedures(id) ON DELETE SET NULL,
  professional_id bigint REFERENCES professionals(id) ON DELETE SET NULL,
  description   varchar(255),
  quantity      numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount   numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  amount        numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS saleitem_sale_idx ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS sale_history (
  id          bigserial PRIMARY KEY,
  sale_id     bigint NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  changed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(50) NOT NULL,
  changes     jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saleh_sale_idx ON sale_history (sale_id);

/* -------------------------------------------------------------------------- */
/*  REPASSE (Cap. 15.3)                                                       */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS payouts (
  id                bigserial PRIMARY KEY,
  organization_id   bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id   bigint NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  location_id       bigint REFERENCES locations(id) ON DELETE SET NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  percentage        numeric(5,2) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  expected_amount   numeric(10,2) NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  carryover_amount  numeric(10,2) NOT NULL DEFAULT 0 CHECK (carryover_amount >= 0),
  amount            numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status            varchar(20) NOT NULL DEFAULT 'confirmado', -- confirmado | cancelado
  notes             text,
  created_by        bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pay_org_idx ON payouts (organization_id);
CREATE INDEX IF NOT EXISTS pay_org_prof_idx ON payouts (organization_id, professional_id);
CREATE INDEX IF NOT EXISTS pay_org_status_idx ON payouts (organization_id, status);

CREATE TABLE IF NOT EXISTS payout_items (
  id          bigserial PRIMARY KEY,
  payout_id   bigint NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  revenue_id  bigint NOT NULL REFERENCES revenues(id) ON DELETE RESTRICT,
  amount      numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS payitem_payout_idx ON payout_items (payout_id);
CREATE INDEX IF NOT EXISTS payitem_rev_idx ON payout_items (revenue_id);

CREATE TABLE IF NOT EXISTS payout_history (
  id          bigserial PRIMARY KEY,
  payout_id   bigint NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  changed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(50) NOT NULL,
  changes     jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payh_payout_idx ON payout_history (payout_id);

/* -------------------------------------------------------------------------- */
/*  RECIBOS (Cap. 15.5)                                                       */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS receipts (
  id                  bigserial PRIMARY KEY,
  organization_id     bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  revenue_id          bigint REFERENCES revenues(id) ON DELETE SET NULL,
  sale_id             bigint REFERENCES sales(id) ON DELETE SET NULL,
  issuer_type         varchar(20) NOT NULL DEFAULT 'usuario', -- usuario | estabelecimento
  issuer_user_id      bigint REFERENCES users(id) ON DELETE SET NULL,
  issuer_establishment_id bigint REFERENCES establishments(id) ON DELETE SET NULL,
  payer_name          varchar(255) NOT NULL,
  amount              numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  description         text,
  status              varchar(20) NOT NULL DEFAULT 'emitido', -- emitido | cancelado
  issued_at           timestamptz NOT NULL DEFAULT now(),
  created_by          bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rec_org_idx ON receipts (organization_id);
CREATE INDEX IF NOT EXISTS rec_org_status_idx ON receipts (organization_id, status);
CREATE INDEX IF NOT EXISTS rec_org_issued_idx ON receipts (organization_id, issued_at);

CREATE TABLE IF NOT EXISTS receipt_history (
  id          bigserial PRIMARY KEY,
  receipt_id  bigint NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  changed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(50) NOT NULL,
  changes     jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rech_receipt_idx ON receipt_history (receipt_id);
