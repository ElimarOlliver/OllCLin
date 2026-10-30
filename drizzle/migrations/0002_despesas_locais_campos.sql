-- OllCLin — Migração 0002
-- Módulos: Configurações Financeiras > Categorias de Despesas (Cap. 08.2)
--          Financeiro > Despesas (Cap. 15.2)
--          Configurações Gerais > Locais de Atendimento + Salas (Cap. 05.010-014)
--          Configurações Gerais > Campos Obrigatórios (Cap. 05.015-019)
-- Banco: Supabase (PostgreSQL). Isolamento por organization_id.

/* -------------------------------------------------------------------------- */
/*  CATEGORIAS DE DESPESA (Cap. 08.2) — hierarquia tipo -> categoria          */
/*  Fixas e Variáveis exemplificadas; categorias personalizadas permitidas.   */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS expense_categories (
  id              bigserial PRIMARY KEY,
  organization_id bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       bigint REFERENCES expense_categories(id) ON DELETE CASCADE,
  name            varchar(255) NOT NULL,
  kind            varchar(20)  NOT NULL DEFAULT 'variavel', -- fixa | variavel
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expcat_org_idx ON expense_categories (organization_id);
CREATE INDEX IF NOT EXISTS expcat_parent_idx ON expense_categories (parent_id);

/* -------------------------------------------------------------------------- */
/*  DESPESAS (Cap. 15.2)                                                      */
/*  Linhas múltiplas (parcelas), recorrência, anexo, cancelamento com motivo. */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS expenses (
  id                bigserial PRIMARY KEY,
  organization_id   bigint NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expense_category_id bigint REFERENCES expense_categories(id) ON DELETE SET NULL,
  payee_name        varchar(255),                        -- Favorecido
  payment_method_id bigint REFERENCES payment_methods(id) ON DELETE RESTRICT,
  installment_no    int NOT NULL DEFAULT 1,
  installments_total int NOT NULL DEFAULT 1,
  amount            numeric(10,2) NOT NULL CHECK (amount >= 0),
  status            varchar(30) NOT NULL DEFAULT 'a_pagar', -- a_pagar | pago | cancelado
  due_date          date,
  paid_at           timestamptz,
  description       text,
  attachment_url    varchar(500),
  recurrence_rule   text,                                -- "Esta despesa se repete"
  created_by        bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exp_org_idx ON expenses (organization_id);
CREATE INDEX IF NOT EXISTS exp_org_status_idx ON expenses (organization_id, status);
CREATE INDEX IF NOT EXISTS exp_org_due_idx ON expenses (organization_id, due_date);

/* Histórico da despesa (edições + status + motivo de cancelamento) */
CREATE TABLE IF NOT EXISTS expense_history (
  id          bigserial PRIMARY KEY,
  expense_id  bigint NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  changed_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(50) NOT NULL,
  changes     jsonb,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exph_exp_idx ON expense_history (expense_id);

/* -------------------------------------------------------------------------- */
/*  LOCAIS DE ATENDIMENTO + SALAS (REQ-05-010..014)                            */
/*  Tabelas já existentes (locations, rooms) ganham campos do cadastro.        */
/* -------------------------------------------------------------------------- */
ALTER TABLE locations ADD COLUMN IF NOT EXISTS organization_id bigint REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone varchar(20);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS email varchar(320);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS address text;
CREATE INDEX IF NOT EXISTS loc_org_idx ON locations (organization_id);

-- Salas por local: rooms.location_id já existe (migração base).

/* -------------------------------------------------------------------------- */
/*  CAMPOS OBRIGATÓRIOS (REQ-05-015..019)                                      */
/*  JSON por organização: { campo: true|false }. Nome sempre obrigatório.      */
/* -------------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS org_settings (
  organization_id bigint PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  required_patient_fields jsonb NOT NULL DEFAULT '{"fullName": true}'::jsonb,
  required_tiss_fields   jsonb NOT NULL DEFAULT '{}'::jsonb,
  inactive_timeout_minutes int CHECK (inactive_timeout_minutes IS NULL OR inactive_timeout_minutes > 0),
  inactive_timeout_enabled boolean NOT NULL DEFAULT false,
  features        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

/* -------------------------------------------------------------------------- */
/*  SEED MÍNIMO: categoria-pai Fixas e Variáveis para organizations existentes */
/* -------------------------------------------------------------------------- */
INSERT INTO expense_categories (organization_id, name, kind)
SELECT o.id, 'Fixas', 'fixa' FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories ec
  WHERE ec.organization_id = o.id AND ec.parent_id IS NULL AND ec.name = 'Fixas'
);

INSERT INTO expense_categories (organization_id, name, kind)
SELECT o.id, 'Variáveis', 'variavel' FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories ec
  WHERE ec.organization_id = o.id AND ec.parent_id IS NULL AND ec.name = 'Variáveis'
);

/* Seed de local de atendimento para organizations que não têm nenhum.
   locations requer establishment_id NOT NULL na base; criamos o estabelecimento
   padrão quando necessário. */
INSERT INTO establishments (organization_id, name)
SELECT o.id, 'Estabelecimento principal' FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM establishments e WHERE e.organization_id = o.id);

INSERT INTO locations (organization_id, establishment_id, name)
SELECT o.id, e.id, 'Sede principal'
FROM organizations o
JOIN establishments e ON e.organization_id = o.id
WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.organization_id = o.id);
