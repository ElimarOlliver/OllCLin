-- OllCLin — Migração 0005
-- Habilitação de Row Level Security (RLS) por organization_id
-- + integração com Supabase Auth (JWT do usuário autenticado).
--
-- O backend continua usando a service role (que ignora RLS) e já filtra por
-- organization_id em cada model — a RLS aqui é a rede de segurança para acesso
-- direto via anon/authenticated (ex.: futuras integrações com clientes).
--
-- O vínculo usuário → organização é resolvido pelo e-mail autenticado
-- (auth.jwt() ->> 'email' -> public.users.email).
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0005_rls_organizations.sql

-- ---------------------------------------------------------------------------
-- Helper: organização do usuário autenticado (via JWT do Supabase Auth)
-- ---------------------------------------------------------------------------
create or replace function public.current_ollclin_organization_id()
returns integer
language sql
stable
as $$
  select organization_id
  from public.users
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

create or replace function public.current_ollclin_user_id()
returns integer
language sql
stable
as $$
  select id
  from public.users
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas tenant-scoped (possuem organization_id)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in array[
    'establishments',
    'locations',
    'rooms',
    'professionals',
    'procedures',
    'patients',
    'appointments',
    'revenues',
    'revenue_history',
    'sales',
    'sale_items',
    'payouts',
    'payout_items',
    'payout_history',
    'receipts',
    'receipt_history',
    'expenses',
    'expense_categories',
    'health_plans',
    'org_settings',
    'payment_methods',
    'audit_log',
    'medical_records',
    'exam_requests',
    'exam_items',
    'attendances',
    'prescriptions',
    'appointment_status_history',
    'user_roles'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Policies: isolamento por organization_id
-- ---------------------------------------------------------------------------

-- Helper local (a policy abaixo roda como função; usamos subqueries diretas).
-- Para cada tabela tenant-scoped, o acesso precisa estar na organização do
-- próprio usuário autenticado.

create policy "org_current_user_select_own_row"
  on public.users
  for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "org_current_user_update_own_row"
  on public.users
  for update
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- Organizações: não há coluna organization_id (a própria tabela é o tenant);
-- a política é aplicada apenas via tabelas filhas (acima) e via audit_log.

do $$
declare
  t text;
begin
  for t in array[
    'establishments',
    'locations',
    'rooms',
    'professionals',
    'procedures',
    'patients',
    'appointments',
    'revenues',
    'revenue_history',
    'sales',
    'sale_items',
    'payouts',
    'payout_items',
    'payout_history',
    'receipts',
    'receipt_history',
    'expenses',
    'expense_categories',
    'health_plans',
    'org_settings',
    'payment_methods',
    'audit_log',
    'medical_records',
    'exam_requests',
    'exam_items',
    'attendances',
    'prescriptions',
    'appointment_status_history',
    'user_roles'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format(
        $fn$
        create policy if not exists "ollclin_%I_isolation"
          on public.%I
          for all
          using (organization_id = public.current_ollclin_organization_id())
          with check (organization_id = public.current_ollclin_organization_id());
        $fn$,
        t,
        t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (o service_role já ignora RLS; garantimos acesso para as roles padrão)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant usage on schema public to authenticated, anon;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant usage on schema auth to authenticated, service_role;
grant all on all tables in schema auth to service_role;
