-- OllCLin — Migração 0006
-- Fase 1 (SaaS): vínculo organização <-> usuário (organization_members)
--
-- Cria o vínculo explícito entre clínica (tenant) e usuário com papel,
-- no modelo multi-tenant SaaS definido no roadmap.
--
-- A tabela `organizations` já existe (tenant root) com colunas consolidadas
-- (name/trade_name/cnpj/is_active). Esta migração cria a tabela de vínculos
-- com hierarquia de papéis e status de convite/ativação.
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0006_organization_members.sql

create table if not exists organization_members (
  id           bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  user_id     bigint not null references users(id) on delete cascade,
  role        varchar(64) not null default 'assistant',
  status      varchar(32) not null default 'active',
  invited_by bigint references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_access_at timestamptz,
  constraint organization_members_org_user_key unique (organization_id, user_id)
);

create index if not exists idx_organization_members_org
  on organization_members (organization_id);

create index if not exists idx_organization_members_user
  on organization_members (user_id);

alter table organization_members enable row level security;

drop policy if exists "organization_members_select_own_org" on organization_members;
create policy "organization_members_select_own_org"
  on organization_members
  for select
  using (organization_id = public.current_ollclin_organization_id());

drop policy if exists "organization_members_insert_own_org" on organization_members;
create policy "organization_members_insert_own_org"
  on organization_members
  for insert
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "organization_members_update_own_org" on organization_members;
create policy "organization_members_update_own_org"
  on organization_members
  for update
  using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "organization_members_delete_own_org" on organization_members;
create policy "organization_members_delete_own_org"
  on organization_members
  for delete
  using (organization_id = public.current_ollclin_organization_id());
