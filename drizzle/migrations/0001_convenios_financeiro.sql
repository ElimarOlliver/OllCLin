-- OllCLin — Migração 0001
-- Módulo: Configurações Gerais > Convênios (Cap. 05 do briefing)
-- Módulo: Financeiro > Receitas (Cap. 15 do briefing)
-- Banco: Supabase (PostgreSQL). Isolamento por organization_id.

/* -------------------------------------------------------------------------- */
/*  CONVÊNIOS (Operadoras / planos de saúde)                                   */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS health_plans (
  id            bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operator_name   varchar(255) NOT NULL,          -- Nome da operadora (lista ANS ou livre)
  ans_code        varchar(20),                    -- Código de registro na ANS (referência externa)
  tiss_xml_version varchar(20),                   -- Versão XML TISS (confirmar com a operadora)
  contact_email   varchar(320),
  contact_phone   varchar(20),
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hplan_org_idx ON health_plans (organization_id);

/* -------------------------------------------------------------------------- */
/*  FORMAS DE RECEBIMENTO (Cap. 08.3) — pré-requisito das receitas            */
/*  Nome e Tipo são obrigatórios (REQ-08-030 / REQ-08-032).                    */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS payment_methods (
  id              bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            varchar(255) NOT NULL,
  type            varchar(50)  NOT NULL,          -- ex.: dinheiro, pix, cartao, convenio, desconto, cortesia
  allows_installments boolean NOT NULL DEFAULT false, -- exibe campo Parcelas quando true (REQ-08-039)
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paym_org_idx ON payment_methods (organization_id);

/* -------------------------------------------------------------------------- */
/*  RECEITAS / RECEBIMENTOS (Cap. 15.1)                                       */
/*  Múltiplas linhas por lançamento (pagador alternativo, parcelas, anexo).   */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS revenues (
  id              bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id      bigint REFERENCES patients(id) ON DELETE SET NULL,
  payer_name      varchar(255),                    -- pagador diferente do paciente (Cap. 15.1)
  procedure_id    bigint REFERENCES procedures(id) ON DELETE SET NULL,
  appointment_id  bigint REFERENCES appointments(id) ON DELETE SET NULL,
  health_plan_id  bigint REFERENCES health_plans(id) ON DELETE SET NULL,
  payment_method_id bigint REFERENCES payment_methods(id) ON DELETE RESTRICT,
  installment_no  int NOT NULL DEFAULT 1,          -- nº da parcela
  installments_total int NOT NULL DEFAULT 1,
  amount          numeric(10,2) NOT NULL CHECK (amount >= 0),
  status          varchar(30) NOT NULL DEFAULT 'a_receber', -- a_receber | recebido | cancelado | desconto | cortesia
  due_date        date,
  received_at     timestamptz,
  description     text,
  attachment_url  varchar(500),
  -- Rastreio de integrações (Cap. 06): etiquetas locais de encaminhamento
  sent_to_omie    boolean NOT NULL DEFAULT false,  -- etiqueta "PO"
  sent_to_conta_azul boolean NOT NULL DEFAULT false, -- etiqueta "CA"
  created_by      bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rev_org_idx ON revenues (organization_id);
CREATE INDEX IF NOT EXISTS rev_org_status_idx ON revenues (organization_id, status);
CREATE INDEX IF NOT EXISTS rev_org_due_idx ON revenues (organization_id, due_date);

/* -------------------------------------------------------------------------- */
/*  HISTÓRICO DE RECEITAS (auditoria por receita — Cap. 15.1.1)               */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS revenue_history (
  id          bigserial PRIMARY KEY,
  revenue_id  bigint NOT NULL REFERENCES revenues(id) ON DELETE CASCADE,
  changed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(50) NOT NULL,                -- CREATE | UPDATE | CANCEL | SEND_TISS
  changes     jsonb,
  reason      text,                                -- motivo exigido no cancelamento
  ip_address  varchar(45),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revh_rev_idx ON revenue_history (revenue_id);
