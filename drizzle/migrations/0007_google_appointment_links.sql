-- OllCLin — Migração 0007
-- Permite que o mesmo agendamento seja sincronizado na agenda de cada
-- usuário autenticado que o criou/editou, sem compartilhar event_id entre contas.

create table if not exists public.appointment_google_events (
  id bigserial primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  appointment_id bigint not null references public.appointments(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  event_id varchar(255) not null,
  calendar_id varchar(255) not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_google_events_appointment_user_key unique (appointment_id, user_id)
);

create index if not exists appointment_google_events_org_user_idx
  on public.appointment_google_events (organization_id, user_id);

alter table public.appointment_google_events enable row level security;
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
drop policy if exists "ollclin_appointment_google_events_isolation" on public.appointment_google_events;
create policy "ollclin_appointment_google_events_isolation"
  on public.appointment_google_events
  for all
  using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

grant all privileges on table public.appointment_google_events to anon, authenticated, service_role;
grant all privileges on sequence public.appointment_google_events_id_seq to anon, authenticated, service_role;
