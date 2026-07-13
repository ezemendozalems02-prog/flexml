-- ============================================================================
-- FlexControl — Migración 0004: Etiquetas Flex, tickets y permisos granulares
-- - Etiquetas: shipping_labels + versiones + accesos + errores + tickets
-- - Permisos por acción/recurso (catálogo + overrides por usuario)
-- - RLS por rol: vendedor ve solo su cliente, repartidor solo lo asignado,
--   y la información financiera queda restringida a owner/admin
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type label_internal_status as enum (
  'pending', 'available', 'downloaded', 'printed', 'reprinted', 'refreshing',
  'cancelled', 'replaced', 'unavailable', 'unauthorized', 'ml_error', 'needs_review'
);

create type label_issue_status as enum (
  'new', 'in_review', 'waiting_ml', 'resolved', 'closed', 'not_resolvable'
);

-- ----------------------------------------------------------------------------
-- Etiquetas
-- ----------------------------------------------------------------------------

create table shipping_labels (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  connection_id        uuid references marketplace_connections(id) on delete set null,
  shipment_id          uuid not null references shipments(id) on delete cascade,
  external_shipment_id text,
  external_status      text,                    -- estado del envío según ML al momento
  internal_status      label_internal_status not null default 'pending',
  format               text,                    -- pdf | zpl | image | zip | unknown
  file_name            text,
  storage_path         text,                    -- ruta en bucket PRIVADO
  file_hash            text,                    -- sha256 para detectar duplicados/reemplazos
  file_size            bigint,
  generated_at         timestamptz,
  expires_at           timestamptz,
  version              int not null default 1,
  last_downloaded_at   timestamptz,
  last_downloaded_by   uuid references platform_users(id),
  download_count       int not null default 0,
  print_count          int not null default 0,
  last_error           text,
  retry_count          int not null default 0,
  requires_review      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (shipment_id)
);

create index idx_labels_org on shipping_labels(organization_id, updated_at desc);
create index idx_labels_client on shipping_labels(client_id);
create index idx_labels_status on shipping_labels(organization_id, internal_status);

create table shipping_label_versions (
  id             uuid primary key default gen_random_uuid(),
  label_id       uuid not null references shipping_labels(id) on delete cascade,
  version        int not null,
  storage_path   text,
  file_hash      text,
  format         text,
  replaced_reason text,
  created_by     uuid references platform_users(id),
  created_at     timestamptz not null default now(),
  unique (label_id, version)
);

create table shipping_label_access_logs (
  id          uuid primary key default gen_random_uuid(),
  label_id    uuid references shipping_labels(id) on delete cascade,
  shipment_id uuid references shipments(id) on delete set null,
  user_id     uuid references platform_users(id) on delete set null,
  action      text not null,           -- view | download | print | refresh
  result      text not null,           -- ok | denied | error | unavailable
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_label_access_label on shipping_label_access_logs(label_id, created_at desc);

create table shipping_label_errors (
  id            uuid primary key default gen_random_uuid(),
  label_id      uuid references shipping_labels(id) on delete cascade,
  shipment_id   uuid references shipments(id) on delete cascade,
  connection_id uuid references marketplace_connections(id) on delete set null,
  http_status   int,
  error_code    text,
  message       text not null,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index idx_label_errors_shipment on shipping_label_errors(shipment_id, created_at desc);

-- Tickets de problemas de etiquetas (§18)
create table shipping_label_issues (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  client_id         uuid references clients(id) on delete set null,
  connection_id     uuid references marketplace_connections(id) on delete set null,
  shipment_id       uuid references shipments(id) on delete cascade,
  label_id          uuid references shipping_labels(id) on delete set null,
  external_order_id text,
  issue_type        text not null,     -- wont_open | cancelled | wrong_package | address_mismatch | duplicated | reprint | ml_not_returning | other
  description       text,
  file_id           uuid references files(id) on delete set null,
  reported_by       uuid references platform_users(id),
  priority          text not null default 'normal',   -- low | normal | high
  status            label_issue_status not null default 'new',
  assignee          uuid references platform_users(id),
  resolution        text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_label_issues_org on shipping_label_issues(organization_id, status, created_at desc);

create table shipping_label_issue_comments (
  id        uuid primary key default gen_random_uuid(),
  issue_id  uuid not null references shipping_label_issues(id) on delete cascade,
  user_id   uuid references platform_users(id),
  body      text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Permisos granulares (§15) — catálogo + overrides por usuario
-- ----------------------------------------------------------------------------

insert into permissions (key, description) values
  ('shipments.view_all',        'Ver todos los envíos de la organización'),
  ('shipments.view_own_client', 'Ver envíos del propio cliente'),
  ('shipments.view_assigned',   'Ver envíos asignados'),
  ('shipments.update_status',   'Actualizar estado operativo'),
  ('shipments.reprogram',       'Reprogramar envíos'),
  ('shipments.cancel',          'Cancelar envíos'),
  ('shipments.export',          'Exportar envíos'),
  ('labels.view',               'Ver etiquetas'),
  ('labels.download',           'Descargar etiquetas'),
  ('labels.print',              'Imprimir etiquetas'),
  ('labels.refresh',            'Actualizar etiqueta desde Mercado Libre'),
  ('labels.report_issue',       'Reportar problema de etiqueta'),
  ('labels.view_history',       'Ver historial de etiquetas'),
  ('labels.manage',             'Gestionar etiquetas y tickets'),
  ('rates.view',                'Ver tarifas'),
  ('rates.create',              'Crear tarifas'),
  ('rates.update',              'Modificar tarifas'),
  ('settlements.view',          'Ver liquidaciones'),
  ('settlements.create',        'Generar liquidaciones'),
  ('settlements.confirm',       'Confirmar liquidaciones'),
  ('settlements.export',        'Exportar liquidaciones'),
  ('billing.view_totals',       'Ver totales facturados'),
  ('clients.manage',            'Gestionar clientes'),
  ('connections.manage',        'Conectar/desconectar Mercado Libre'),
  ('zones.manage',              'Gestionar zonas y localidades'),
  ('users.manage',              'Gestionar usuarios'),
  ('roles.manage',              'Gestionar roles y permisos'),
  ('audit.view',                'Ver auditoría')
on conflict (key) do nothing;

-- Overrides puntuales por usuario (granted=false revoca, granted=true otorga)
create table user_permissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references platform_users(id) on delete cascade,
  permission_key  text not null references permissions(key) on delete cascade,
  granted         boolean not null,
  created_by      uuid references platform_users(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id, permission_key)
);

-- Configuración de cuentas compartidas (§14)
create table shared_account_settings (
  organization_id      uuid primary key references organizations(id) on delete cascade,
  allow_shared_accounts boolean not null default false,
  acknowledged_warning  boolean not null default false,
  updated_by            uuid references platform_users(id),
  updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helper de alcance por rol (usado por RLS)
-- ----------------------------------------------------------------------------

create or replace function can_view_shipment(org uuid, ship_client uuid, ship_driver uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.role in ('owner','admin','operator')
        or (m.role = 'client' and m.client_id is not null and m.client_id = ship_client)
        or (m.role = 'driver' and m.driver_id is not null and m.driver_id = ship_driver)
      )
  ) or is_superadmin()
$$;

create or replace function can_view_shipment_id(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shipments s
    where s.id = sid
      and can_view_shipment(s.organization_id, s.client_id, s.driver_id)
  )
$$;

-- ----------------------------------------------------------------------------
-- RLS: reescribir alcance de envíos por rol (§12, §13)
-- ----------------------------------------------------------------------------

drop policy if exists shipments_select on shipments;
create policy shipments_select on shipments for select
  using (can_view_shipment(organization_id, client_id, driver_id));

drop policy if exists ship_addr_rw on shipment_addresses;
create policy ship_addr_select on shipment_addresses for select
  using (can_view_shipment_id(shipment_id));
create policy ship_addr_write on shipment_addresses
  for all using (
    exists (select 1 from shipments s where s.id = shipment_id
            and has_org_role(s.organization_id, array['owner','admin','operator']::member_role[]))
  );

drop policy if exists ship_events_select on shipment_events;
drop policy if exists shipment_events_select on shipment_events;
create policy shipment_events_select on shipment_events for select
  using (can_view_shipment_id(shipment_id));

-- ----------------------------------------------------------------------------
-- RLS: información financiera SOLO owner/admin (§12/§13: vendedor y repartidor
-- no ven tarifas, precios ni liquidaciones)
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'zone_rates','client_zone_rates','shipment_rate_calculations',
    'weekly_settlements','payment_records','client_settlements','driver_settlements'
  ] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format($p$create policy %I_select on %I for select
      using (has_org_role(organization_id, array['owner','admin']::member_role[]))$p$, t, t);
  end loop;
end $$;

drop policy if exists billing_rules_select on billing_rules;
create policy billing_rules_select on billing_rules for select
  using (
    organization_id is null and auth.uid() is not null
    or (organization_id is not null and has_org_role(organization_id, array['owner','admin']::member_role[]))
  );

drop policy if exists charge_items_rw on shipment_charge_items;
create policy charge_items_rw on shipment_charge_items for all
  using (exists (select 1 from shipment_rate_calculations c
                 where c.id = calculation_id
                 and has_org_role(c.organization_id, array['owner','admin']::member_role[])));

-- ----------------------------------------------------------------------------
-- RLS de etiquetas: staff todo; vendedor su cliente; repartidor lo asignado
-- ----------------------------------------------------------------------------

alter table shipping_labels             enable row level security;
alter table shipping_label_versions    enable row level security;
alter table shipping_label_access_logs enable row level security;
alter table shipping_label_errors      enable row level security;
alter table shipping_label_issues      enable row level security;
alter table shipping_label_issue_comments enable row level security;
alter table user_permissions           enable row level security;
alter table shared_account_settings    enable row level security;

create policy labels_select on shipping_labels for select
  using (can_view_shipment_id(shipment_id));
create policy labels_write on shipping_labels for all
  using (has_org_role(organization_id, array['owner','admin','operator']::member_role[]));

create policy label_versions_select on shipping_label_versions for select
  using (exists (select 1 from shipping_labels l where l.id = label_id and can_view_shipment_id(l.shipment_id)));

create policy label_access_select on shipping_label_access_logs for select
  using (exists (select 1 from shipping_labels l where l.id = label_id
                 and has_org_role(l.organization_id, array['owner','admin']::member_role[])));

create policy label_errors_select on shipping_label_errors for select
  using (exists (select 1 from shipments s where s.id = shipment_id
                 and has_org_role(s.organization_id, array['owner','admin','operator']::member_role[])));

-- Tickets: el que reporta ve los suyos; staff ve todos los de la org
create policy label_issues_select on shipping_label_issues for select
  using (
    has_org_role(organization_id, array['owner','admin','operator']::member_role[])
    or reported_by = auth.uid()
  );
create policy label_issues_insert on shipping_label_issues for insert
  with check (is_org_member(organization_id));
create policy label_issues_update on shipping_label_issues for update
  using (has_org_role(organization_id, array['owner','admin','operator']::member_role[]));

create policy issue_comments_select on shipping_label_issue_comments for select
  using (exists (select 1 from shipping_label_issues i where i.id = issue_id
                 and (has_org_role(i.organization_id, array['owner','admin','operator']::member_role[])
                      or i.reported_by = auth.uid())));
create policy issue_comments_insert on shipping_label_issue_comments for insert
  with check (exists (select 1 from shipping_label_issues i where i.id = issue_id
                      and (has_org_role(i.organization_id, array['owner','admin','operator']::member_role[])
                           or i.reported_by = auth.uid())));

create policy user_permissions_select on user_permissions for select
  using (user_id = auth.uid() or has_org_role(organization_id, array['owner','admin']::member_role[]));
create policy user_permissions_write on user_permissions for all
  using (has_org_role(organization_id, array['owner']::member_role[]));

create policy shared_settings_rw on shared_account_settings for all
  using (has_org_role(organization_id, array['owner','admin']::member_role[]));

create trigger trg_shipping_labels_updated before update on shipping_labels
  for each row execute function set_updated_at();
create trigger trg_label_issues_updated before update on shipping_label_issues
  for each row execute function set_updated_at();
