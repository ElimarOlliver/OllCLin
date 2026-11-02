-- OllCLin — Migração 0009
-- Fase 5 (SaaS): pagamentos / maquininhas de cartão.
--
-- payment_intents        : intenção de pagamento (idempotente por idempotency_key)
-- payment_transactions   : histórico de transições de estado (auditoria financeira)
-- payment_webhook_events : eventos de webhook das adquirentes (dedupe por event_id)
--
-- LGPD/PCI: nenhum dado de cartão (PAN/CVV) é armazenado — apenas tokenização
-- feita pela adquirente. Valores SEMPRE em centavos (bigint).
--
-- Aplicar: node scripts/pg-client.mjs --file drizzle/migrations/0009_payments.sql

create table if not exists payment_intents (
  id              varchar(64) primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  idempotency_key varchar(255) not null,
  reference_type  varchar(64) not null,
  reference_id    bigint not null,
  amount_cents    bigint not null check (amount_cents > 0),
  currency        varchar(8) not null default 'BRL',
  method          varchar(32) not null,
  installments    int not null default 1,
  status          varchar(32) not null default 'created',
  provider_name   varchar(64) not null,
  provider_transaction_id varchar(255),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payment_intents_idempotency_key_key unique (idempotency_key)
);

create index if not exists idx_payment_intents_org
  on payment_intents (organization_id, created_at desc);
create index if not exists idx_payment_intents_reference
  on payment_intents (organization_id, reference_type, reference_id);

create table if not exists payment_transactions (
  id bigserial primary key,
  payment_intent_id varchar(64) not null references payment_intents(id) on delete cascade,
  organization_id bigint not null references organizations(id) on delete cascade,
  from_status varchar(32),
  to_status   varchar(32) not null,
  amount_cents bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_tx_intent
  on payment_transactions (payment_intent_id, created_at);

create table if not exists payment_webhook_events (
  id bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  provider_name varchar(64) not null,
  event_id varchar(255) not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint payment_webhook_events_provider_event_key unique (provider_name, event_id)
);

create index if not exists idx_payment_webhooks_org
  on payment_webhook_events (organization_id, received_at desc);

-- RLS por tenant
alter table payment_intents enable row level security;
alter table payment_transactions enable row level security;
alter table payment_webhook_events enable row level security;

create or replace function public.current_ollclin_organization_id()
returns integer
language sql stable
as $$
  select organization_id from public.users
  where lower(email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

drop policy if exists "payment_intents_isolation" on payment_intents;
create policy "payment_intents_isolation" on payment_intents
  for all using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "payment_tx_isolation" on payment_transactions;
create policy "payment_tx_isolation" on payment_transactions
  for all using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "payment_webhooks_isolation" on payment_webhook_events;
create policy "payment_webhooks_isolation" on payment_webhook_events
  for all using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

grant all privileges on table payment_intents, payment_transactions, payment_webhook_events
  to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
