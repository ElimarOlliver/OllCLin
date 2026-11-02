-- OllCLin — Migração 0006
-- Comunicação interna entre usuários da mesma organização.
-- Mensagens deixam de ser elegíveis para leitura após 48 horas e são
-- removidas pelo backend em cada operação de leitura/escrita.

create table if not exists public.chat_messages (
  id bigserial primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  sender_id bigint not null references public.users(id) on delete cascade,
  recipient_id bigint not null references public.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  read_at timestamptz,
  constraint chat_sender_recipient_different check (sender_id <> recipient_id)
);

create index if not exists chat_messages_org_expiry_idx
  on public.chat_messages (organization_id, expires_at);
create index if not exists chat_messages_conversation_idx
  on public.chat_messages (organization_id, sender_id, recipient_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "ollclin_chat_isolation" on public.chat_messages;
create policy "ollclin_chat_isolation"
  on public.chat_messages
  for all
  using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

grant all privileges on table public.chat_messages to anon, authenticated, service_role;
grant all privileges on sequence public.chat_messages_id_seq to anon, authenticated, service_role;

-- A função pode ser agendada no pg_cron do projeto Supabase para limpeza física.
-- Mesmo sem pg_cron, o backend nunca devolve mensagens expiradas.
create or replace function public.cleanup_expired_chat_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.chat_messages where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
