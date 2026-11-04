-- OllCLin — Migração 0010
-- SaaS: cadastro público com trial de 10 dias, titular master e permissões
-- granulares por usuário (controle do titular).
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0010_saas_signup_permissions.sql

-- ---------------------------------------------------------------------------
-- 1. organizations: trial de 10 dias
-- ---------------------------------------------------------------------------
alter table organizations add column if not exists trial_started_at timestamptz;
alter table organizations add column if not exists trial_ends_at timestamptz;
alter table organizations add column if not exists plan varchar(32) not null default 'trial';

-- ---------------------------------------------------------------------------
-- 2. users: titular da conta (is_owner) — somente o primeiro cadastro é titular
-- ---------------------------------------------------------------------------
alter table users add column if not exists is_owner boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Permissões granulares por usuário (ativar/desativar pelo titular)
-- ---------------------------------------------------------------------------
-- Áreas do sistema; o titular ativa/desativa acesso total ou parcial por usuário.
create table if not exists permission_areas (
  id          serial primary key,
  key         varchar(64) not null unique,
  label       varchar(128) not null,
  description varchar(255),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists member_permissions (
  id             bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  user_id        bigint not null references users(id) on delete cascade,
  area_key       varchar(64) not null references permission_areas(key) on delete cascade,
  -- 'none' (sem acesso) | 'partial' (somente leitura) | 'full' (total)
  access_level   varchar(16) not null default 'none' check (access_level in ('none','partial','full')),
  granted_by     bigint references users(id) on delete set null,
  updated_at     timestamptz not null default now(),
  constraint member_permissions_unique unique (organization_id, user_id, area_key)
);

create index if not exists idx_member_permissions_org_user
  on member_permissions (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- 4. Catálogo padrão de áreas (idempotente)
-- ---------------------------------------------------------------------------
insert into permission_areas (key, label, description, sort_order) values
  ('agenda',        'Agenda',            'Agendamentos e marcações', 10),
  ('pacientes',     'Pacientes',         'Cadastro e prontuário de pacientes', 20),
  ('profissionais', 'Profissionais',     'Cadastro de profissionais', 30),
  ('procedimentos', 'Procedimentos',     'Catálogo de procedimentos', 40),
  ('convenios',     'Convênios',         'Convênios e planos de saúde', 50),
  ('financeiro',    'Financeiro',        'Receitas, despesas, vendas, repasses e extrato', 60),
  ('recibos',       'Recibos',           'Emissão de recibos', 70),
  ('relatorios',    'Relatórios',        'Relatórios e exportações', 80),
  ('configuracoes', 'Configurações',     'Locais, salas e campos obrigatórios', 90),
  ('usuarios',      'Usuários',          'Gestão de usuários e permissões (área restrita)', 100)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. RLS: member_permissions isolado por tenant (padrão do projeto)
-- ---------------------------------------------------------------------------
alter table member_permissions enable row level security;

drop policy if exists "member_permissions_select_own_org" on member_permissions;
create policy "member_permissions_select_own_org"
  on member_permissions for select
  using (organization_id = public.current_ollclin_organization_id());

drop policy if exists "member_permissions_insert_own_org" on member_permissions;
create policy "member_permissions_insert_own_org"
  on member_permissions for insert
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "member_permissions_update_own_org" on member_permissions;
create policy "member_permissions_update_own_org"
  on member_permissions for update
  using (organization_id = public.current_ollclin_organization_id());

drop policy if exists "member_permissions_delete_own_org" on member_permissions;
create policy "member_permissions_delete_own_org"
  on member_permissions for delete
  using (organization_id = public.current_ollclin_organization_id());

-- permission_areas é catálogo global: leitura pública para autenticados.
alter table permission_areas enable row level security;
drop policy if exists "permission_areas_select_all" on permission_areas;
create policy "permission_areas_select_all"
  on permission_areas for select
  using (true);
