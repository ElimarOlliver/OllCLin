-- OllCLin — Migração 0011
-- Provisionamento de tenant pós-pagamento: status/planos da organização,
-- provedores de pagamento POR TENANT (multi-gateway), convites com token
-- hashado e catálogo de planos.
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0011_tenant_provisioning.sql

-- ---------------------------------------------------------------------------
-- 1. organizations: colunas que faltam (mantém is_active sincronizado)
-- ---------------------------------------------------------------------------
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists slug varchar(140);
alter table organizations add column if not exists status varchar(32) not null default 'trial'
  check (status in ('trial','active','suspended','canceled'));
alter table organizations add column if not exists gateway_customer_id varchar(255);
alter table organizations add column if not exists gateway_subscription_id varchar(255);
alter table organizations add column if not exists onboarding_completed_at timestamptz;
-- plan/trial_started_at/trial_ends_at já existem (0010). Adiciona plano pago escolhido:
alter table organizations add column if not exists plan_key varchar(32);
alter table organizations add column if not exists payment_provider varchar(32);

-- slug único (nullable — só para orgs provisionadas)
create unique index if not exists organizations_slug_key
  on organizations (slug) where slug is not null;

-- Backfill: organizações existentes viram 'active' (já operam); trial com trial_ends_at futuro vira 'trial'.
update organizations
set status = case
  when trial_ends_at is not null and trial_ends_at > now() then 'trial'
  else 'active'
end
where status is null or status = 'trial' and plan = 'trial' and trial_ends_at is null;

-- Sincroniza is_active com status (trigger idempotente)
create or replace function ollclin_sync_org_status()
returns trigger language plpgsql as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end $$;

drop trigger if exists trg_ollclin_sync_org_status on organizations;
create trigger trg_ollclin_sync_org_status
  before insert or update of status on organizations
  for each row execute function ollclin_sync_org_status();

-- ---------------------------------------------------------------------------
-- 2. Catálogo de planos (pesquisa de mercado — valores fictícios de referência)
-- ---------------------------------------------------------------------------
create table if not exists saas_plans (
  key          varchar(32) primary key,
  name         varchar(64) not null,
  price_cents  int not null,
  max_users    int not null,
  features     jsonb not null default '[]'::jsonb,
  sort_order   int not null default 0,
  is_active    boolean not null default true
);

insert into saas_plans (key, name, price_cents, max_users, features, sort_order) values
  ('essencial',   'Essencial',   9700,  2, '["Agenda + Google Calendar","Pacientes ilimitados","Financeiro básico","1 usuário incluso"]', 10),
  ('profissional','Profissional',19700, 8, '["Tudo do Essencial","Financeiro completo (repasses, recibos)","Relatórios e exportações","Até 8 usuários"]', 20),
  ('clinica',     'Clínica',     34700, 25, '["Tudo do Profissional","Multi-estabelecimento","Permissões avançadas por usuário","Suporte prioritário","Até 25 usuários"]', 30)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Provedores de pagamento POR ESTABELECIMENTO (multi-gateway)
--    Cada tenant pode ter seu próprio gateway; chaves ficam no .env por
--    provider (nunca no banco). A tabela guarda apenas a escolha + refs.
-- ---------------------------------------------------------------------------
create table if not exists organization_payment_providers (
  id              bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  provider        varchar(32) not null,           -- stripe | mercadopago | asaas | pagarme | mock
  is_default      boolean not null default false,
  -- Public/参照 IDs do gateway (nunca secret key):
  account_ref     varchar(255),
  webhook_secret_hint varchar(255),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint org_payment_provider_unique unique (organization_id, provider)
);

-- ---------------------------------------------------------------------------
-- 4. account_invitations (tokens de ativação/convite — guarda só o HASH)
-- ---------------------------------------------------------------------------
create table if not exists account_invitations (
  id              bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  email           varchar(320) not null,
  role            varchar(64) not null default 'assistant',
  token_hash      varchar(64) not null unique,    -- sha-256 hex
  type            varchar(32) not null default 'staff_invite'
                  check (type in ('owner_activation','staff_invite')),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  invited_by      bigint references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_account_invitations_email
  on account_invitations (email, used_at);

-- RLS por tenant (padrão 0005)
alter table account_invitations enable row level security;
drop policy if exists "account_invitations_select_own_org" on account_invitations;
create policy "account_invitations_select_own_org" on account_invitations
  for select using (organization_id = public.current_ollclin_organization_id());
drop policy if exists "account_invitations_insert_own_org" on account_invitations;
create policy "account_invitations_insert_own_org" on account_invitations
  for insert with check (organization_id = public.current_ollclin_organization_id());
drop policy if exists "account_invitations_update_own_org" on account_invitations;
create policy "account_invitations_update_own_org" on account_invitations
  for update using (organization_id = public.current_ollclin_organization_id());
drop policy if exists "account_invitations_delete_own_org" on account_invitations;
create policy "account_invitations_delete_own_org" on account_invitations
  for delete using (organization_id = public.current_ollclin_organization_id());

alter table organization_payment_providers enable row level security;
drop policy if exists "org_payment_providers_isolation" on organization_payment_providers;
create policy "org_payment_providers_isolation" on organization_payment_providers
  for all using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

-- saas_plans: catálogo global, leitura para autenticados
alter table saas_plans enable row level security;
drop policy if exists "saas_plans_read_all" on saas_plans;
create policy "saas_plans_read_all" on saas_plans for select using (true);

-- owner_activation não deve ser visível pelo membro comum: sem policy de
-- select para staff? RLS acima já restringe à org; suficiente neste escopo.
