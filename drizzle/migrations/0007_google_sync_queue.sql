-- OllCLin — Migração 0007
-- Fase 2 (SaaS): fila de sincronização + vínculos de evento Google Calendar
--
-- calendar_sync_jobs:
--   operacoes: create | update | delete | pull | reconcile
--   idempotencia: idempotency_key (unique por operacao de agendamento)
--   status: pending | processing | done | failed
--   next_attempt_at: agenda de retry com backoff
--
-- appointment_google_events:
--   vínculo entre agendamento e evento Google (etag, status, ultimo sync)
--
-- Aplicar NO SUPABASE (SQL Editor) ou via:
--   node scripts/pg-client.mjs --file drizzle/migrations/0007_google_sync_queue.sql

create table if not exists appointment_google_events (
  id              bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  appointment_id bigint not null references appointments(id) on delete cascade,
  user_id         bigint not null references users(id) on delete cascade,
  calendar_id    varchar(255) not null default 'primary',
  event_id       varchar(255) not null,
  etag           varchar(255),
  last_synced_at timestamptz,
  sync_status    varchar(32) not null default 'pending', -- pending | synced | failed | removed
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_appointment_google_events_appointment
  on appointment_google_events (appointment_id, user_id);

create index if not exists idx_appointment_google_events_org
  on appointment_google_events (organization_id);

alter table appointment_google_events enable row level security;

-- ---------------------------------------------------------------------------
-- Fila de sincronização
-- ---------------------------------------------------------------------------
create table if not exists calendar_sync_jobs (
  id              bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  appointment_id bigint not null references appointments(id) on delete cascade,
  user_id         bigint not null references users(id) on delete cascade,
  operation      varchar(32) not null, -- create | update | delete | pull | reconcile
  payload        jsonb not null default '{}'::jsonb,
  idempotency_key varchar(255) not null,
  attempts       int not null default 0,
  status         varchar(32) not null default 'pending', -- pending | processing | done | failed
  next_attempt_at timestamptz not null default now(),
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint calendar_sync_jobs_idempotency_key_key unique (idempotency_key)
);

create index if not exists idx_calendar_sync_jobs_status
  on calendar_sync_jobs (status, next_attempt_at);

alter table calendar_sync_jobs enable row level security;

-- Garante unicidade por agendamento/usuário para upsert do vínculo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointment_google_events_appointment_user_key'
  ) then
    alter table appointment_google_events
      add constraint appointment_google_events_appointment_user_key
      unique (appointment_id, user_id);
  end if;
end
$$;
