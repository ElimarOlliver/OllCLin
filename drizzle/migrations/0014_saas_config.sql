-- OllCLin — Migração 0014
-- Configurações de negócio do SaaS (antes fixas no código, agora por tenant).
-- Valores default: preencher conforme decisão comercial; nunca hardcode.
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0014_saas_config.sql

create table if not exists public.organization_config (
  organization_id   integer primary key references public.organizations(id) on delete cascade,
  -- Validade do acesso (dias) — sobreposição do trial quando definida.
  access_validity_days integer,
  -- Aviso por e-mail X dias antes do vencimento.
  expiry_warning_days  integer,
  -- Ao vencer: 'block' (bloqueia login) | 'readonly' (somente leitura)
  -- | 'auto_renew' (renovação automática).
  expiry_action        varchar(16) default 'readonly'
                       check (expiry_action in ('block','readonly','auto_renew')),
  -- Período de teste gratuito (dias) — usado no cadastro.
  trial_days           integer,
  -- Limite de usuários por empresa.
  max_users            integer,
  -- CNPJ duplicado: 'block' bloqueia novo cadastro | 'link' vincula à existente.
  duplicate_cnpj_action varchar(8) default 'block'
                       check (duplicate_cnpj_action in ('block','link')),
  -- Liberação do acesso: 'auto' | 'manual' (aprovação por admin).
  approval_mode        varchar(8) default 'auto'
                       check (approval_mode in ('auto','manual')),
  -- Fuso horário de referência para cálculo dos dias.
  timezone             varchar(64) default 'America/Sao_Paulo',
  updated_at           timestamptz not null default now()
);

alter table public.organization_config enable row level security;

-- RLS: apenas a própria organização lê/escreve a própria configuração.
drop policy if exists org_config_self on public.organization_config;
create policy org_config_self on public.organization_config
  for all using (
    organization_id = public.current_ollclin_organization_id()
  )
  with check (
    organization_id = public.current_ollclin_organization_id()
  );
