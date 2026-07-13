-- ============================================================================
-- FlexControl — Migración 0001: Fundaciones
-- Tenancy, usuarios, roles, clientes, conexiones Mercado Libre
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type member_role as enum ('owner', 'admin', 'operator', 'client', 'driver');

create type connection_status as enum (
  'connecting', 'active', 'syncing', 'error',
  'token_expired', 'auth_revoked', 'disconnected', 'needs_reauth'
);

create type sync_job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

create type notification_processing_status as enum ('pending', 'processing', 'processed', 'failed', 'discarded');

-- ----------------------------------------------------------------------------
-- Tenancy
-- ----------------------------------------------------------------------------

create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  legal_name        text,
  tax_id            text,                          -- CUIT
  email             text,
  phone             text,
  whatsapp          text,
  address           text,
  logo_url          text,
  timezone          text not null default 'America/Argentina/Buenos_Aires',
  currency          text not null default 'ARS',
  country           text not null default 'AR',
  status            text not null default 'active',  -- active | suspended | trial
  plan              text not null default 'standard',
  onboarding_step   int  not null default 0,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table organization_settings (
  organization_id     uuid primary key references organizations(id) on delete cascade,
  pickup_window_start time,
  pickup_window_end   time,
  delivery_window_start time,
  delivery_window_end time,
  operating_days      int[] not null default '{1,2,3,4,5,6}',  -- ISO: 1=lunes
  week_starts_on      int not null default 1,
  vehicle_types       text[] not null default '{}',
  approx_drivers      int,
  approx_daily_shipments int,
  coverage_notes      text,
  settings            jsonb not null default '{}',
  updated_at          timestamptz not null default now()
);

-- Perfil extendido de auth.users
create table platform_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  avatar_url   text,
  is_superadmin boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references platform_users(id) on delete cascade,
  role            member_role not null,
  client_id       uuid,          -- FK diferida a clients (usuarios de comercio)
  driver_id       uuid,          -- FK diferida a drivers (usuarios repartidor)
  status          text not null default 'active',   -- active | invited | suspended
  invited_by      uuid references platform_users(id),
  invited_at      timestamptz,
  joined_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_members_user on organization_members(user_id);
create index idx_members_org on organization_members(organization_id);

-- Permisos finos (extensión futura de los roles base)
create table permissions (
  key         text primary key,
  description text not null
);

create table roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name            text not null,
  base_role       member_role not null,
  unique (organization_id, name)
);

create table role_permissions (
  role_id        uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- Invitaciones por correo
create table invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           text not null,
  role            member_role not null,
  client_id       uuid,
  driver_id       uuid,
  token           text not null unique,
  invited_by      uuid references platform_users(id),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Clientes (comercios de la transportista)
-- ----------------------------------------------------------------------------

create table clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,               -- nombre comercial
  legal_name       text,
  tax_id           text,
  contact_name     text,
  email            text,
  phone            text,
  whatsapp         text,
  pickup_address   text,
  pickup_city      text,
  pickup_province  text,
  pickup_zip       text,
  pickup_lat       double precision,
  pickup_lng       double precision,
  pickup_window_start time,
  pickup_window_end   time,
  pickup_days      int[] not null default '{1,2,3,4,5,6}',
  status           text not null default 'active',  -- active | paused | archived
  notes            text,
  logo_url         text,
  -- condiciones comerciales
  price_per_shipment numeric(12,2),
  price_per_retry    numeric(12,2),
  price_per_return   numeric(12,2),
  pricing_currency   text not null default 'ARS',
  pricing_rules      jsonb not null default '{}',   -- precio por zona/localidad, etc.
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index idx_clients_org on clients(organization_id) where deleted_at is null;

create table client_users (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  member_id  uuid not null references organization_members(id) on delete cascade,
  unique (client_id, member_id)
);

alter table organization_members
  add constraint fk_members_client foreign key (client_id) references clients(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Conexiones Mercado Libre
-- ----------------------------------------------------------------------------

create table marketplace_connections (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  client_id              uuid not null references clients(id) on delete cascade,
  provider               text not null default 'mercadolibre',
  external_user_id       text not null,          -- ID del vendedor en ML
  nickname               text,
  site_id                text,                   -- MLA, MLB, ...
  access_token_encrypted text,                   -- AES-256-GCM, nunca en claro
  refresh_token_encrypted text,
  token_expires_at       timestamptz,
  scopes                 text[],
  status                 connection_status not null default 'connecting',
  connected_at           timestamptz,
  connected_by           uuid references platform_users(id),
  disconnected_at        timestamptz,
  last_refresh_at        timestamptz,
  last_refresh_error     text,
  refresh_lock_until     timestamptz,            -- lock lógico anti-renovación simultánea
  last_sync_at           timestamptz,
  last_successful_sync_at timestamptz,
  last_error             text,
  consecutive_errors     int not null default 0,
  import_from            timestamptz,            -- desde qué fecha importar histórico
  metadata               jsonb not null default '{}',
  is_mock                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organization_id, provider, external_user_id)
);

create index idx_connections_org on marketplace_connections(organization_id);
create index idx_connections_client on marketplace_connections(client_id);
create index idx_connections_expiry on marketplace_connections(token_expires_at) where status = 'active';

-- Estados temporales del flujo OAuth
create table oauth_states (
  state           text primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  user_id         uuid not null references platform_users(id) on delete cascade,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table marketplace_token_events (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references marketplace_connections(id) on delete cascade,
  event         text not null,      -- issued | refreshed | refresh_failed | revoked | expired
  detail        text,
  created_at    timestamptz not null default now()
);

create index idx_token_events_conn on marketplace_token_events(connection_id, created_at desc);

create table marketplace_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  connection_id   uuid references marketplace_connections(id) on delete cascade,
  job_type        text not null,     -- initial_import | incremental | reconcile | notification | token_refresh
  status          sync_job_status not null default 'queued',
  cursor          jsonb,             -- paginación / reanudación por lotes
  started_at      timestamptz,
  finished_at     timestamptz,
  duration_ms     int,
  processed_count int not null default 0,
  success_count   int not null default 0,
  failure_count   int not null default 0,
  error           text,
  created_at      timestamptz not null default now()
);

create index idx_sync_jobs_conn on marketplace_sync_jobs(connection_id, created_at desc);
create index idx_sync_jobs_status on marketplace_sync_jobs(status) where status in ('queued','running');

create table marketplace_sync_logs (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references marketplace_sync_jobs(id) on delete cascade,
  connection_id  uuid references marketplace_connections(id) on delete cascade,
  level          text not null default 'info',   -- info | warn | error
  resource       text,                            -- order/shipment id externo
  message        text not null,
  detail         jsonb,
  created_at     timestamptz not null default now()
);

create index idx_sync_logs_job on marketplace_sync_logs(job_id);
create index idx_sync_logs_conn_err on marketplace_sync_logs(connection_id, created_at desc) where level = 'error';

-- Eventos brutos recibidos por webhook (dedupe por notification_id)
create table marketplace_notifications (
  id               uuid primary key default gen_random_uuid(),
  external_id      text,                -- _id de la notificación ML si viene
  topic            text not null,
  resource         text not null,
  external_user_id text,
  received_at      timestamptz not null default now(),
  payload          jsonb not null,
  status           notification_processing_status not null default 'pending',
  attempts         int not null default 0,
  last_error       text,
  processed_at     timestamptz,
  unique (topic, resource, external_id)
);

create index idx_ml_notifications_pending on marketplace_notifications(status, received_at) where status in ('pending','failed');

-- ----------------------------------------------------------------------------
-- Auditoría y archivos
-- ----------------------------------------------------------------------------

create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  user_id         uuid references platform_users(id) on delete set null,
  action          text not null,
  resource_type   text not null,
  resource_id     text,
  ip              inet,
  user_agent      text,
  old_data        jsonb,
  new_data        jsonb,
  reason          text,
  created_at      timestamptz not null default now()
);

create index idx_audit_org on audit_logs(organization_id, created_at desc);

create table files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  bucket          text not null,
  path            text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references platform_users(id),
  created_at      timestamptz not null default now(),
  unique (bucket, path)
);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid references platform_users(id) on delete cascade,  -- null = toda la org
  type            text not null,
  title           text not null,
  body            text,
  href            text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, created_at desc) where read_at is null;

-- ----------------------------------------------------------------------------
-- Helpers de RLS
-- ----------------------------------------------------------------------------

create or replace function auth_user_id() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from platform_users where id = auth.uid()), false)
$$;

create or replace function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.status = 'active'
  ) or is_superadmin()
$$;

create or replace function has_org_role(org uuid, wanted member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(wanted)
  ) or is_superadmin()
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table organizations           enable row level security;
alter table organization_settings   enable row level security;
alter table platform_users          enable row level security;
alter table organization_members    enable row level security;
alter table roles                   enable row level security;
alter table permissions             enable row level security;
alter table role_permissions        enable row level security;
alter table invitations             enable row level security;
alter table clients                 enable row level security;
alter table client_users            enable row level security;
alter table marketplace_connections enable row level security;
alter table oauth_states            enable row level security;
alter table marketplace_token_events enable row level security;
alter table marketplace_sync_jobs   enable row level security;
alter table marketplace_sync_logs   enable row level security;
alter table marketplace_notifications enable row level security;
alter table audit_logs              enable row level security;
alter table files                   enable row level security;
alter table notifications           enable row level security;

-- Organizaciones: los miembros ven la suya; solo owners la modifican
create policy org_select on organizations for select
  using (is_org_member(id));
create policy org_update on organizations for update
  using (has_org_role(id, array['owner']::member_role[]));

create policy org_settings_select on organization_settings for select
  using (is_org_member(organization_id));
create policy org_settings_write on organization_settings for all
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));

-- Perfil propio
create policy users_self_select on platform_users for select
  using (id = auth.uid() or is_superadmin()
         or exists (select 1 from organization_members me
                    join organization_members them on them.organization_id = me.organization_id
                    where me.user_id = auth.uid() and them.user_id = platform_users.id));
create policy users_self_update on platform_users for update using (id = auth.uid());
create policy users_self_insert on platform_users for insert with check (id = auth.uid());

create policy members_select on organization_members for select
  using (is_org_member(organization_id));
create policy members_write on organization_members for all
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));

create policy roles_rw on roles for all using (is_org_member(organization_id));
create policy permissions_read on permissions for select using (true);
create policy role_permissions_rw on role_permissions for all
  using (exists (select 1 from roles r where r.id = role_id and is_org_member(r.organization_id)));

create policy invitations_rw on invitations for all
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));

create policy clients_select on clients for select using (is_org_member(organization_id));
create policy clients_write on clients for all
  using (has_org_role(organization_id, array['owner','admin','operator']::member_role[]));

create policy client_users_rw on client_users for all
  using (exists (select 1 from clients c where c.id = client_id and is_org_member(c.organization_id)));

-- Conexiones: visibles para miembros (los tokens cifrados solo los usa el service role,
-- las columnas *_encrypted nunca se seleccionan desde el cliente)
create policy connections_select on marketplace_connections for select
  using (is_org_member(organization_id));
create policy connections_write on marketplace_connections for all
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));

-- oauth_states / token_events / sync: solo service role escribe; lectura por org
create policy oauth_states_none on oauth_states for select using (is_superadmin());
create policy token_events_select on marketplace_token_events for select
  using (exists (select 1 from marketplace_connections c where c.id = connection_id and is_org_member(c.organization_id)));
create policy sync_jobs_select on marketplace_sync_jobs for select
  using (organization_id is null and is_superadmin() or is_org_member(organization_id));
create policy sync_logs_select on marketplace_sync_logs for select
  using (exists (select 1 from marketplace_connections c where c.id = connection_id and is_org_member(c.organization_id)));
create policy ml_notifications_admin on marketplace_notifications for select using (is_superadmin());

create policy audit_select on audit_logs for select
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));
create policy audit_insert on audit_logs for insert
  with check (is_org_member(organization_id));

create policy files_rw on files for all using (is_org_member(organization_id));

create policy notifications_select on notifications for select
  using (is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on notifications for update
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','organization_members','clients','marketplace_connections','platform_users']
  loop
    execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
