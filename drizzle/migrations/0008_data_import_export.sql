-- OllCLin — Migração 0008
-- Fase 3 (SaaS): importação e exportação de dados
--
-- import_batches: registro de cada arquivo importado (CSV/XLSX/XLS/DOCX),
-- com status da bateria e relatório de rejeições.
--
-- Pacientes: campos de menoridade e responsável (importação de dependentes).

create table if not exists import_batches (
  id bigserial primary key,
  organization_id bigint not null references organizations(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  file_name varchar(255) not null,
  file_type varchar(64) not null,
  status varchar(32) not null default 'pending', -- pending | processing | preview | confirmed | failed
  total_rows int not null default 0,
  imported_rows int not null default 0,
  rejected_rows int not null default 0,
  errors jsonb not null default '{}'::jsonb,
  file_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_batches_org_created
  on import_batches (organization_id, created_at);

create index if not exists idx_import_batches_user_created
  on import_batches (user_id, created_at);

alter table import_batches enable row level security;

drop policy if exists "import_batches_select_own_org" on import_batches;
create policy "import_batches_select_own_org"
  on import_batches
  for select
  using (organization_id = public.current_ollclin_organization_id());

drop policy if exists "import_batches_insert_own_org" on import_batches;
create policy "import_batches_insert_own_org"
  on import_batches
  for insert
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "import_batches_update_own_org" on import_batches;
create policy "import_batches_update_own_org"
  on import_batches
  for update
  using (organization_id = public.current_ollclin_organization_id())
  with check (organization_id = public.current_ollclin_organization_id());

drop policy if exists "import_batches_delete_own_org" on import_batches;
create policy "import_batches_delete_own_org"
  on import_batches
  for delete
  using (organization_id = public.current_ollclin_organization_id());

-- Pacientes: menoridade, responsável e consentimento (Fase 3 — importação).
alter table patients add column if not exists is_minor boolean not null default false;
alter table patients add column if not exists guardian_patient_id bigint references patients(id) on delete set null;
alter table patients add column if not exists guardian_name varchar(255);
alter table patients add column if not exists guardian_document varchar(14);
alter table patients add column if not exists consent_status varchar(32) not null default 'pending';
