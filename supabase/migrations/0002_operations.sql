-- ============================================================================
-- FlexControl — Migración 0002: Operación
-- Zonas, repartidores, vehículos, órdenes/envíos, rutas, retiros,
-- incidencias, cierres semanales y liquidaciones
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums operativos
-- ----------------------------------------------------------------------------

create type internal_status as enum (
  'imported', 'pending_classification', 'pending_pickup', 'picked_up',
  'at_warehouse', 'classified', 'assigned', 'route_prep', 'out_for_delivery',
  'visited', 'delivered', 'partial_delivery', 'not_answered', 'absent',
  'wrong_address', 'incomplete_address', 'dangerous_zone', 'rejected',
  'rescheduled', 'cancelled_by_ml', 'cancelled_by_client', 'returned',
  'pending_return', 'returned_to_seller', 'lost', 'damaged', 'under_review'
);

create type event_source as enum (
  'mercadolibre', 'scheduled_sync', 'admin', 'operator', 'driver',
  'client', 'automation', 'import', 'system'
);

create type route_status as enum (
  'draft', 'prepared', 'confirmed', 'in_progress', 'paused',
  'completed', 'closed', 'cancelled'
);

create type pickup_status as enum (
  'scheduled', 'en_route', 'at_client', 'started', 'completed',
  'partial', 'cancelled'
);

create type driver_status as enum (
  'active', 'inactive', 'suspended', 'on_vacation', 'unavailable', 'on_route'
);

create type settlement_status as enum (
  'draft', 'calculated', 'in_review', 'issued', 'paid', 'overdue', 'void'
);

-- ----------------------------------------------------------------------------
-- Zonas
-- ----------------------------------------------------------------------------

create table zones (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  color            text not null default '#64748b',
  description      text,
  priority         int not null default 100,       -- menor = mayor prioridad
  price_per_delivery numeric(12,2),
  currency         text not null default 'ARS',
  schedule         jsonb not null default '{}',    -- horarios / días habilitados
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (organization_id, name)
);

create table zone_rules (
  id        uuid primary key default gen_random_uuid(),
  zone_id   uuid not null references zones(id) on delete cascade,
  rule_type text not null,          -- zip | city | neighborhood | district | province | polygon
  value     text,                   -- CP, localidad, etc.
  polygon   jsonb,                  -- GeoJSON para rule_type = polygon
  created_at timestamptz not null default now()
);

create index idx_zone_rules_zone on zone_rules(zone_id);
create index idx_zone_rules_lookup on zone_rules(rule_type, value);

-- ----------------------------------------------------------------------------
-- Repartidores y vehículos
-- ----------------------------------------------------------------------------

create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  plate           text,
  vehicle_type    text,             -- moto | auto | utilitario | camioneta | bici
  capacity        int,              -- paquetes aprox
  status          text not null default 'active',
  notes           text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table drivers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  first_name       text not null,
  last_name        text not null,
  national_id      text,            -- DNI
  email            text,
  phone            text,
  whatsapp         text,
  address          text,
  photo_url        text,
  status           driver_status not null default 'active',
  contract_type    text,            -- empleado | monotributista | tercerizado
  hired_at         date,
  vehicle_id       uuid references vehicles(id) on delete set null,
  usual_zone_ids   uuid[] not null default '{}',
  schedule         jsonb not null default '{}',
  emergency_contact jsonb,
  documents        jsonb not null default '[]',   -- [{name, url, expires_at}]
  pay_per_delivery numeric(12,2),
  pay_rules        jsonb not null default '{}',   -- por zona/paquete/hora, bonos
  pay_currency     text not null default 'ARS',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index idx_drivers_org on drivers(organization_id) where deleted_at is null;

alter table organization_members
  add constraint fk_members_driver foreign key (driver_id) references drivers(id) on delete set null;

create table driver_availability (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references drivers(id) on delete cascade,
  date       date not null,
  available  boolean not null default true,
  note       text,
  unique (driver_id, date)
);

-- ----------------------------------------------------------------------------
-- Órdenes y envíos
-- ----------------------------------------------------------------------------

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,
  connection_id      uuid references marketplace_connections(id) on delete set null,
  external_order_id  text,
  pack_id            text,
  external_seller_id text,
  external_buyer_id  text,
  site_id            text,
  sold_at            timestamptz,
  total_amount       numeric(14,2),
  currency           text,
  external_status    text,
  raw_payload        jsonb,          -- JSON original para auditoría
  data_source        text not null default 'mercadolibre',  -- mercadolibre | csv | manual | mock
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index uq_orders_external on orders(connection_id, external_order_id)
  where connection_id is not null and external_order_id is not null;
create index idx_orders_org on orders(organization_id, sold_at desc);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  external_item_id text,
  title       text,
  sku         text,
  quantity    int not null default 1,
  unit_price  numeric(14,2),
  currency    text,
  raw_payload jsonb
);

create index idx_order_items_order on order_items(order_id);

create table shipments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  client_id             uuid not null references clients(id) on delete cascade,
  connection_id         uuid references marketplace_connections(id) on delete set null,
  order_id              uuid references orders(id) on delete set null,
  -- Identificación externa
  external_shipment_id  text,
  external_order_id     text,
  pack_id               text,
  external_seller_id    text,
  site_id               text,
  -- Comercial
  sold_at               timestamptz,
  title_summary         text,          -- resumen de productos
  package_count         int not null default 1,
  declared_value        numeric(14,2),
  currency              text,
  -- Logística externa
  logistic_type         text,          -- valor original de ML
  shipping_mode         text,          -- valor original de ML
  service_id            text,
  promised_date         date,
  promised_window_start time,
  promised_window_end   time,
  deadline_at           timestamptz,
  external_status       text,
  external_substatus    text,
  external_updated_at   timestamptz,
  external_tags         text[] not null default '{}',
  -- Clasificación Flex
  is_flex               boolean,
  flex_reason           text,
  flex_rule_version     text,
  -- Operación interna
  internal_status       internal_status not null default 'imported',
  zone_id               uuid references zones(id) on delete set null,
  suggested_zone_id     uuid references zones(id) on delete set null,
  zone_method           text,           -- zip | city | neighborhood | polygon | manual
  zone_confidence       text,           -- high | medium | low
  zone_set_by           uuid references platform_users(id),
  route_id              uuid,           -- FK diferida a routes
  driver_id             uuid references drivers(id) on delete set null,
  delivery_sequence     int,
  picked_up_at          timestamptz,
  departed_at           timestamptz,
  first_attempt_at      timestamptz,
  attempt_count         int not null default 0,
  delivered_at          timestamptz,
  result                text,
  incident_reason_id    uuid,           -- FK diferida a incident_reasons
  rescheduled_to        date,
  notes                 text,
  -- Control
  requires_review       boolean not null default false,
  data_incomplete       boolean not null default false,
  manually_overridden   jsonb not null default '{}',   -- {campo: true}
  archived_at           timestamptz,
  data_source           text not null default 'mercadolibre',
  last_synced_at        timestamptz,
  last_change_source    event_source not null default 'system',
  raw_payload           jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index uq_shipments_external on shipments(connection_id, external_shipment_id)
  where connection_id is not null and external_shipment_id is not null;
create index idx_shipments_org_status on shipments(organization_id, internal_status);
create index idx_shipments_org_date on shipments(organization_id, created_at desc);
create index idx_shipments_client on shipments(client_id, created_at desc);
create index idx_shipments_driver on shipments(driver_id) where driver_id is not null;
create index idx_shipments_zone on shipments(zone_id) where zone_id is not null;
create index idx_shipments_route on shipments(route_id) where route_id is not null;
create index idx_shipments_promised on shipments(organization_id, promised_date);
create index idx_shipments_extid on shipments(external_shipment_id);

create table shipment_addresses (
  shipment_id     uuid primary key references shipments(id) on delete cascade,
  receiver_name   text,
  street          text,
  street_number   text,
  floor_unit      text,
  apartment       text,
  between_streets text,
  reference       text,
  neighborhood    text,
  city            text,
  district        text,          -- partido
  province        text,
  zip             text,
  country         text default 'AR',
  lat             double precision,
  lng             double precision,
  phone           text,          -- solo si está permitido; se muestra parcial
  data_source     text not null default 'mercadolibre',
  manually_overridden boolean not null default false,
  external_value  jsonb,         -- valor externo original si se editó a mano
  updated_at      timestamptz not null default now()
);

create index idx_ship_addr_zip on shipment_addresses(zip);
create index idx_ship_addr_city on shipment_addresses(city);

-- Línea de tiempo completa
create table shipment_events (
  id                    uuid primary key default gen_random_uuid(),
  shipment_id           uuid not null references shipments(id) on delete cascade,
  organization_id       uuid not null references organizations(id) on delete cascade,
  event_type            text not null,     -- imported | classified | assigned | picked_up | status_change | attempt | delivered | rescheduled | evidence | sync | note | reconciled ...
  old_internal_status   internal_status,
  new_internal_status   internal_status,
  old_external_status   text,
  new_external_status   text,
  user_id               uuid references platform_users(id),
  driver_id             uuid references drivers(id),
  source                event_source not null,
  note                  text,
  lat                   double precision,
  lng                   double precision,
  metadata              jsonb not null default '{}',
  created_at            timestamptz not null default now()
);

create index idx_ship_events_shipment on shipment_events(shipment_id, created_at);
create index idx_ship_events_org on shipment_events(organization_id, created_at desc);

create table shipment_assignments (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references shipments(id) on delete cascade,
  driver_id    uuid not null references drivers(id) on delete cascade,
  route_id     uuid,
  assigned_by  uuid references platform_users(id),
  assigned_at  timestamptz not null default now(),
  unassigned_at timestamptz,
  active       boolean not null default true
);

create index idx_assignments_shipment on shipment_assignments(shipment_id) where active;
create unique index uq_assignment_active on shipment_assignments(shipment_id) where active;

create table incident_reasons (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid references organizations(id) on delete cascade,  -- null = catálogo global
  code                 text not null,
  label                text not null,
  requires_photo       boolean not null default false,
  requires_note        boolean not null default false,
  requires_location    boolean not null default false,
  allows_reschedule    boolean not null default true,
  requires_return      boolean not null default false,
  is_billable          boolean not null default false,
  affects_effectiveness boolean not null default true,
  visible_to_client    boolean not null default true,
  visible_to_driver    boolean not null default true,
  active               boolean not null default true,
  sort_order           int not null default 100,
  unique (organization_id, code)
);

alter table shipments
  add constraint fk_shipments_incident foreign key (incident_reason_id) references incident_reasons(id) on delete set null;

create table shipment_attempts (
  id                 uuid primary key default gen_random_uuid(),
  shipment_id        uuid not null references shipments(id) on delete cascade,
  driver_id          uuid references drivers(id),
  attempt_number     int not null,
  attempted_at       timestamptz not null default now(),
  outcome            text not null,     -- delivered | failed | rescheduled | returned
  incident_reason_id uuid references incident_reasons(id),
  receiver_name      text,
  receiver_id_partial text,
  note               text,
  lat                double precision,
  lng                double precision,
  rescheduled_to     date,
  reschedule_window  text,
  requested_by       text,             -- quién pidió el cambio
  contact_channel    text,
  created_at         timestamptz not null default now()
);

create index idx_attempts_shipment on shipment_attempts(shipment_id, attempt_number);

create table shipment_evidence (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references shipments(id) on delete cascade,
  attempt_id   uuid references shipment_attempts(id) on delete set null,
  evidence_type text not null,      -- photo | signature | document | location
  file_id      uuid references files(id) on delete set null,
  lat          double precision,
  lng          double precision,
  captured_by  uuid references platform_users(id),
  created_at   timestamptz not null default now()
);

create index idx_evidence_shipment on shipment_evidence(shipment_id);

create table shipment_notes (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  user_id     uuid references platform_users(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Rutas
-- ----------------------------------------------------------------------------

create table routes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  code             text not null,
  name             text,
  date             date not null,
  driver_id        uuid references drivers(id) on delete set null,
  vehicle_id       uuid references vehicles(id) on delete set null,
  zone_id          uuid references zones(id) on delete set null,
  departure_time   time,
  status           route_status not null default 'draft',
  shipment_count   int not null default 0,
  est_distance_km  numeric(10,2),
  est_duration_min int,
  started_at       timestamptz,
  finished_at      timestamptz,
  notes            text,
  created_by       uuid references platform_users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code)
);

create index idx_routes_org_date on routes(organization_id, date desc);
create index idx_routes_driver on routes(driver_id, date desc);

alter table shipments
  add constraint fk_shipments_route foreign key (route_id) references routes(id) on delete set null;
alter table shipment_assignments
  add constraint fk_assignments_route foreign key (route_id) references routes(id) on delete set null;

create table route_stops (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references routes(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  sequence    int not null,
  arrived_at  timestamptz,
  completed_at timestamptz,
  outcome     text,
  unique (route_id, shipment_id)
);

create index idx_route_stops_route on route_stops(route_id, sequence);

-- ----------------------------------------------------------------------------
-- Retiros
-- ----------------------------------------------------------------------------

create table pickup_orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  client_id        uuid not null references clients(id) on delete cascade,
  connection_id    uuid references marketplace_connections(id) on delete set null,
  date             date not null,
  window_start     time,
  window_end       time,
  address          text,
  responsible_id   uuid references drivers(id) on delete set null,
  vehicle_id       uuid references vehicles(id) on delete set null,
  expected_count   int not null default 0,
  picked_count     int not null default 0,
  status           pickup_status not null default 'scheduled',
  notes            text,
  signature_file_id uuid references files(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_pickups_org_date on pickup_orders(organization_id, date desc);

create table pickup_order_shipments (
  pickup_order_id uuid not null references pickup_orders(id) on delete cascade,
  shipment_id     uuid not null references shipments(id) on delete cascade,
  expected        boolean not null default true,
  picked          boolean not null default false,
  picked_at       timestamptz,
  note            text,
  primary key (pickup_order_id, shipment_id)
);

-- Escaneos
create table scan_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  shipment_id     uuid references shipments(id) on delete set null,
  code            text not null,
  action          text not null,     -- pickup | warehouse_in | classify | assign | load | return | search
  result          text not null,     -- ok | not_found | duplicate | error
  user_id         uuid references platform_users(id),
  lat             double precision,
  lng             double precision,
  device          text,
  created_at      timestamptz not null default now()
);

create index idx_scans_org on scan_events(organization_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Cierres semanales y liquidaciones
-- ----------------------------------------------------------------------------

create table weekly_closures (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  client_id        uuid references clients(id) on delete cascade,   -- null = global
  connection_id    uuid references marketplace_connections(id) on delete set null,
  week_start       date not null,
  week_end         date not null,
  version          int not null default 1,
  status           text not null default 'open',   -- open | closed | reopened
  totals           jsonb not null default '{}',    -- snapshot de métricas
  closed_by        uuid references platform_users(id),
  closed_at        timestamptz,
  reopened_by      uuid references platform_users(id),
  reopened_at      timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (organization_id, client_id, connection_id, week_start, version)
);

create table weekly_closure_items (
  id           uuid primary key default gen_random_uuid(),
  closure_id   uuid not null references weekly_closures(id) on delete cascade,
  shipment_id  uuid not null references shipments(id) on delete cascade,
  snapshot     jsonb not null      -- estado del envío al momento del cierre
);

create index idx_closure_items on weekly_closure_items(closure_id);

create table client_settlements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  client_id        uuid not null references clients(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  shipment_count   int not null default 0,
  subtotal         numeric(14,2) not null default 0,
  adjustments      numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  currency         text not null default 'ARS',
  status           settlement_status not null default 'draft',
  notes            text,
  created_by       uuid references platform_users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table client_settlement_items (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references client_settlements(id) on delete cascade,
  shipment_id   uuid references shipments(id) on delete set null,
  concept       text not null,      -- delivery | retry | return | surcharge | discount | adjustment
  quantity      int not null default 1,
  unit_price    numeric(14,2) not null default 0,
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'ARS'
);

create table driver_settlements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  driver_id        uuid not null references drivers(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  assigned_count   int not null default 0,
  delivered_count  int not null default 0,
  failed_count     int not null default 0,
  subtotal         numeric(14,2) not null default 0,
  adjustments      numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  currency         text not null default 'ARS',
  status           settlement_status not null default 'draft',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table driver_settlement_items (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references driver_settlements(id) on delete cascade,
  shipment_id   uuid references shipments(id) on delete set null,
  concept       text not null,
  quantity      int not null default 1,
  unit_price    numeric(14,2) not null default 0,
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'ARS'
);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'zones','zone_rules','vehicles','drivers','driver_availability',
    'orders','order_items','shipments','shipment_addresses','shipment_events',
    'shipment_assignments','incident_reasons','shipment_attempts',
    'shipment_evidence','shipment_notes','routes','route_stops',
    'pickup_orders','pickup_order_shipments','scan_events',
    'weekly_closures','weekly_closure_items','client_settlements',
    'client_settlement_items','driver_settlements','driver_settlement_items'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Tablas con organization_id directa: lectura para miembros, escritura para staff
do $$
declare t text;
begin
  foreach t in array array[
    'zones','vehicles','drivers','orders','shipments','shipment_events',
    'routes','pickup_orders','scan_events','weekly_closures',
    'client_settlements','driver_settlements'
  ] loop
    execute format('create policy %I_select on %I for select using (is_org_member(organization_id))', t, t);
    execute format($p$create policy %I_write on %I for all
      using (has_org_role(organization_id, array['owner','admin','operator']::member_role[]))$p$, t, t);
  end loop;
end $$;

-- Tablas hijas: heredan por su padre
create policy zone_rules_rw on zone_rules for all
  using (exists (select 1 from zones z where z.id = zone_id and is_org_member(z.organization_id)));
create policy driver_avail_rw on driver_availability for all
  using (exists (select 1 from drivers d where d.id = driver_id and is_org_member(d.organization_id)));
create policy order_items_rw on order_items for all
  using (exists (select 1 from orders o where o.id = order_id and is_org_member(o.organization_id)));
create policy ship_addr_rw on shipment_addresses for all
  using (exists (select 1 from shipments s where s.id = shipment_id and is_org_member(s.organization_id)));
create policy assignments_rw on shipment_assignments for all
  using (exists (select 1 from shipments s where s.id = shipment_id and is_org_member(s.organization_id)));
create policy attempts_rw on shipment_attempts for all
  using (exists (select 1 from shipments s where s.id = shipment_id and is_org_member(s.organization_id)));
create policy evidence_rw on shipment_evidence for all
  using (exists (select 1 from shipments s where s.id = shipment_id and is_org_member(s.organization_id)));
create policy ship_notes_rw on shipment_notes for all
  using (exists (select 1 from shipments s where s.id = shipment_id and is_org_member(s.organization_id)));
create policy route_stops_rw on route_stops for all
  using (exists (select 1 from routes r where r.id = route_id and is_org_member(r.organization_id)));
create policy pickup_ships_rw on pickup_order_shipments for all
  using (exists (select 1 from pickup_orders p where p.id = pickup_order_id and is_org_member(p.organization_id)));
create policy closure_items_ro on weekly_closure_items for select
  using (exists (select 1 from weekly_closures w where w.id = closure_id and is_org_member(w.organization_id)));
create policy cli_settle_items_rw on client_settlement_items for all
  using (exists (select 1 from client_settlements s where s.id = settlement_id and is_org_member(s.organization_id)));
create policy drv_settle_items_rw on driver_settlement_items for all
  using (exists (select 1 from driver_settlements s where s.id = settlement_id and is_org_member(s.organization_id)));

-- Catálogo de incidencias: global (org null) legible por todos; propio por org
create policy incident_reasons_select on incident_reasons for select
  using (organization_id is null or is_org_member(organization_id));
create policy incident_reasons_write on incident_reasons for all
  using (organization_id is not null and has_org_role(organization_id, array['owner','admin']::member_role[]));

-- Repartidores: además, un driver solo ve sus envíos asignados (política adicional restrictiva
-- se aplica en la capa de aplicación filtrando por driver_id de su membership; la política
-- select de shipments ya exige membership de la organización).

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['zones','drivers','shipments','routes','pickup_orders','client_settlements','driver_settlements']
  loop
    execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Catálogo global de motivos de incidencia
-- ----------------------------------------------------------------------------

insert into incident_reasons (organization_id, code, label, requires_photo, requires_note, requires_location, allows_reschedule, requires_return, affects_effectiveness, sort_order) values
  (null, 'recipient_absent',      'Destinatario ausente',              false, false, true,  true,  false, true, 10),
  (null, 'no_answer',             'No responde',                       false, false, true,  true,  false, true, 20),
  (null, 'wrong_address',         'Dirección incorrecta',              false, true,  true,  true,  false, true, 30),
  (null, 'incomplete_address',    'Dirección incompleta',              false, true,  false, true,  false, true, 40),
  (null, 'no_such_number',        'No existe la numeración',           true,  true,  true,  true,  false, true, 50),
  (null, 'inaccessible_zone',     'Zona inaccesible',                  false, true,  true,  true,  false, true, 60),
  (null, 'dangerous_zone',        'Zona peligrosa',                    false, true,  true,  true,  false, true, 70),
  (null, 'business_closed',       'Comercio cerrado',                  true,  false, true,  true,  false, true, 80),
  (null, 'rejected_by_recipient', 'Destinatario rechazó el paquete',   false, true,  true,  false, true,  true, 90),
  (null, 'reschedule_requested',  'Destinatario solicitó reprogramación', false, true, false, true, false, false, 100),
  (null, 'package_damaged',       'Paquete dañado',                    true,  true,  false, false, true,  true, 110),
  (null, 'package_missing',       'Paquete faltante',                  false, true,  false, false, false, true, 120),
  (null, 'classification_error',  'Error de clasificación',            false, true,  false, true,  false, false, 130),
  (null, 'assignment_error',      'Error de asignación',               false, true,  false, true,  false, false, 140),
  (null, 'vehicle_issue',         'Problema con vehículo',             false, true,  false, true,  false, false, 150),
  (null, 'weather_issue',         'Problema climático',                false, false, false, true,  false, false, 160),
  (null, 'out_of_schedule',       'Fuera de horario',                  false, false, false, true,  false, true, 170),
  (null, 'cancelled_by_ml',       'Cancelado en Mercado Libre',        false, false, false, false, true,  false, 180),
  (null, 'cancelled_by_client',   'Cancelado por el comercio',         false, true,  false, false, true,  false, 190),
  (null, 'other',                 'Otro',                              false, true,  false, true,  false, true, 200);
