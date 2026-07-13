-- ============================================================================
-- FlexControl — Migración 0003: Tarifas, localidades y liquidación semanal
-- Localidades con alias, tarifas por zona con vigencia histórica, tarifas por
-- cliente, reglas de cobro, precio congelado por envío y liquidaciones.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type charge_mode as enum ('full', 'fixed', 'percent', 'none', 'review');

create type rate_source as enum ('shipment_override', 'client_rate', 'zone_rate');

create type calculation_status as enum (
  'calculated', 'no_zone', 'no_rate', 'not_billable', 'review', 'overridden'
);

create type weekly_settlement_status as enum (
  'draft', 'pending_review', 'reviewed', 'confirmed', 'sent',
  'partially_paid', 'paid', 'overdue', 'void'
);

create type retry_billing_mode as enum ('final_only', 'plus_retry', 'per_visit');

-- Modalidad de cobro de reintentos, configurable por cliente (§9)
alter table clients
  add column retry_billing_mode retry_billing_mode not null default 'final_only';

-- Código visible/configurable de la zona (Zona 1 / Cercana / etc.)
alter table zones add column code text;

-- ----------------------------------------------------------------------------
-- Localidades y alias (§2, §3)
-- ----------------------------------------------------------------------------

create table locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  normalized_name text not null,           -- minúsculas, sin tildes
  province        text,
  district        text,                    -- partido / departamento
  zip             text,
  zone_id         uuid references zones(id) on delete set null,
  status          text not null default 'active',   -- active | inactive
  notes           text,
  created_by      uuid references platform_users(id),
  updated_by      uuid references platform_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, normalized_name)
);

create index idx_locations_org on locations(organization_id);
create index idx_locations_zone on locations(zone_id);

create table location_aliases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  location_id      uuid not null references locations(id) on delete cascade,
  alias            text not null,
  normalized_alias text not null,
  created_by       uuid references platform_users(id),
  created_at       timestamptz not null default now(),
  unique (organization_id, normalized_alias)
);

create index idx_location_aliases_loc on location_aliases(location_id);

-- Vista de compatibilidad: relación zona ↔ localidad
create view zone_locations as
  select zone_id, id as location_id, organization_id
  from locations
  where zone_id is not null;

-- ----------------------------------------------------------------------------
-- Tarifas con vigencia histórica (§4, §5, §6)
-- ----------------------------------------------------------------------------

create table zone_rates (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  zone_id                  uuid not null references zones(id) on delete cascade,
  price                    numeric(14,2) not null,   -- precio base por envío
  currency                 text not null default 'ARS',
  retry_price              numeric(14,2),
  return_price             numeric(14,2),
  reschedule_price         numeric(14,2),
  additional_package_price numeric(14,2),
  weekend_price            numeric(14,2),
  valid_from               date not null,
  valid_to                 date,                     -- null = vigente
  status                   text not null default 'active',
  notes                    text,
  created_by               uuid references platform_users(id),
  created_at               timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index idx_zone_rates_lookup on zone_rates(zone_id, valid_from desc);

create table client_zone_rates (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  client_id                uuid not null references clients(id) on delete cascade,
  zone_id                  uuid not null references zones(id) on delete cascade,
  price                    numeric(14,2) not null,
  currency                 text not null default 'ARS',
  retry_price              numeric(14,2),
  return_price             numeric(14,2),
  reschedule_price         numeric(14,2),
  additional_package_price numeric(14,2),
  weekend_price            numeric(14,2),
  valid_from               date not null,
  valid_to                 date,
  status                   text not null default 'active',
  notes                    text,
  created_by               uuid references platform_users(id),
  created_at               timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index idx_client_zone_rates_lookup on client_zone_rates(client_id, zone_id, valid_from desc);

-- ----------------------------------------------------------------------------
-- Reglas de cobro por estado / motivo (§8, §10)
-- ----------------------------------------------------------------------------

create table billing_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,  -- null = default global
  applies_to      text not null,       -- 'status' | 'incident'
  rule_key        text not null,       -- internal_status o code de incident_reasons
  charge          charge_mode not null default 'none',
  fixed_amount    numeric(14,2),       -- para charge = fixed
  percent         numeric(5,2),        -- para charge = percent (0-100)
  active          boolean not null default true,
  notes           text,
  updated_by      uuid references platform_users(id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, applies_to, rule_key)
);

-- ----------------------------------------------------------------------------
-- Precio congelado por envío (§7, §24)
-- ----------------------------------------------------------------------------

create table shipment_rate_calculations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,
  connection_id      uuid references marketplace_connections(id) on delete set null,
  shipment_id        uuid not null references shipments(id) on delete cascade,
  original_city      text,
  normalized_city    text,
  location_id        uuid references locations(id) on delete set null,
  zone_id            uuid references zones(id) on delete set null,
  rate_id            uuid,                 -- id de zone_rates o client_zone_rates
  rate_source        rate_source,
  base_price         numeric(14,2) not null default 0,
  additions_total    numeric(14,2) not null default 0,
  discounts_total    numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  currency           text not null default 'ARS',
  billable           boolean not null default false,
  billing_rule       jsonb not null default '{}',   -- regla aplicada + desglose para auditoría
  status             calculation_status not null default 'calculated',
  requires_review    boolean not null default false,
  calculated_at      timestamptz not null default now(),
  -- corrección manual auditada
  overridden_by      uuid references platform_users(id),
  override_reason    text,
  previous_total     numeric(14,2),
  unique (shipment_id)
);

create index idx_calc_org on shipment_rate_calculations(organization_id, calculated_at desc);
create index idx_calc_client on shipment_rate_calculations(client_id);
create index idx_calc_status on shipment_rate_calculations(organization_id, status)
  where status in ('no_zone','no_rate','review');

create table shipment_charge_items (
  id             uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references shipment_rate_calculations(id) on delete cascade,
  concept        text not null,   -- delivery | retry | return | reschedule | additional_package | adjustment
  description    text,
  quantity       int not null default 1,
  unit_price     numeric(14,2) not null default 0,
  amount         numeric(14,2) not null default 0,
  currency       text not null default 'ARS',
  billable       boolean not null default true,
  metadata       jsonb not null default '{}'
);

create index idx_charge_items_calc on shipment_charge_items(calculation_id);

-- ----------------------------------------------------------------------------
-- Liquidación semanal (§13–§20)
-- ----------------------------------------------------------------------------

create table weekly_settlements (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  number               text not null,
  period_start         date not null,
  period_end           date not null,
  status               weekly_settlement_status not null default 'draft',
  currency             text not null default 'ARS',
  shipments_subtotal   numeric(14,2) not null default 0,
  additionals_subtotal numeric(14,2) not null default 0,
  adjustments_total    numeric(14,2) not null default 0,
  total                numeric(14,2) not null default 0,
  counts               jsonb not null default '{}',   -- totales por zona/concepto para el resumen
  validation_issues    jsonb not null default '[]',   -- problemas detectados (§19)
  version              int not null default 1,
  generated_by         uuid references platform_users(id),
  generated_at         timestamptz not null default now(),
  confirmed_by         uuid references platform_users(id),
  confirmed_at         timestamptz,
  sent_at              timestamptz,
  paid_at              timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, client_id, period_start, version),
  unique (organization_id, number)
);

create index idx_settlements_org on weekly_settlements(organization_id, period_start desc);

create table weekly_settlement_accounts (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references weekly_settlements(id) on delete cascade,
  connection_id uuid references marketplace_connections(id) on delete set null,
  nickname      text,
  zone_summary  jsonb not null default '[]',   -- [{zone_id, zone_name, count, unit_price, subtotal}]
  subtotal      numeric(14,2) not null default 0
);

create index idx_settlement_accounts on weekly_settlement_accounts(settlement_id);

create table weekly_settlement_items (
  id               uuid primary key default gen_random_uuid(),
  settlement_id    uuid not null references weekly_settlements(id) on delete cascade,
  account_id       uuid references weekly_settlement_accounts(id) on delete set null,
  shipment_id      uuid references shipments(id) on delete set null,
  calculation_id   uuid references shipment_rate_calculations(id) on delete set null,
  zone_id          uuid references zones(id) on delete set null,
  concept          text not null,
  quantity         int not null default 1,
  unit_price       numeric(14,2) not null default 0,
  amount           numeric(14,2) not null default 0,
  currency         text not null default 'ARS',
  billable         boolean not null default true,
  excluded         boolean not null default false,
  exclusion_reason text
);

create index idx_settlement_items on weekly_settlement_items(settlement_id);

create table weekly_settlement_adjustments (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references weekly_settlements(id) on delete cascade,
  adj_type      text not null,   -- discount | surcharge | bonus | correction | special_trip | wait | toll | extra_pickup | other
  description   text not null,
  amount        numeric(14,2) not null,   -- con signo: negativo descuenta
  currency      text not null default 'ARS',
  reason        text not null,
  file_id       uuid references files(id) on delete set null,
  created_by    uuid references platform_users(id),
  created_at    timestamptz not null default now()
);

create table weekly_settlement_versions (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references weekly_settlements(id) on delete cascade,
  version       int not null,
  snapshot      jsonb not null,
  reason        text,
  created_by    uuid references platform_users(id),
  created_at    timestamptz not null default now()
);

create table payment_records (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  settlement_id uuid not null references weekly_settlements(id) on delete cascade,
  amount        numeric(14,2) not null,
  currency      text not null default 'ARS',
  paid_at       date not null,
  method        text,
  reference     text,
  notes         text,
  recorded_by   uuid references platform_users(id),
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'locations','location_aliases','zone_rates','client_zone_rates','billing_rules',
    'shipment_rate_calculations','shipment_charge_items','weekly_settlements',
    'weekly_settlement_accounts','weekly_settlement_items',
    'weekly_settlement_adjustments','weekly_settlement_versions','payment_records'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Localidades: operadores pueden mantenerlas; tarifas y liquidaciones: solo owner/admin
do $$
declare t text;
begin
  foreach t in array array['locations','location_aliases'] loop
    execute format('create policy %I_select on %I for select using (is_org_member(organization_id))', t, t);
    execute format($p$create policy %I_write on %I for all
      using (has_org_role(organization_id, array['owner','admin','operator']::member_role[]))$p$, t, t);
  end loop;
  foreach t in array array['zone_rates','client_zone_rates','shipment_rate_calculations','weekly_settlements','payment_records'] loop
    execute format('create policy %I_select on %I for select using (is_org_member(organization_id))', t, t);
    execute format($p$create policy %I_write on %I for all
      using (has_org_role(organization_id, array['owner','admin']::member_role[]))$p$, t, t);
  end loop;
end $$;

create policy billing_rules_select on billing_rules for select
  using (organization_id is null or is_org_member(organization_id));
create policy billing_rules_write on billing_rules for all
  using (organization_id is not null and has_org_role(organization_id, array['owner','admin']::member_role[]));

create policy charge_items_rw on shipment_charge_items for all
  using (exists (select 1 from shipment_rate_calculations c
                 where c.id = calculation_id and is_org_member(c.organization_id)));

do $$
declare t text;
begin
  foreach t in array array[
    'weekly_settlement_accounts','weekly_settlement_items',
    'weekly_settlement_adjustments','weekly_settlement_versions'
  ] loop
    execute format($p$create policy %I_rw on %I for all
      using (exists (select 1 from weekly_settlements s
                     where s.id = settlement_id and is_org_member(s.organization_id)))$p$, t, t);
  end loop;
end $$;

create trigger trg_locations_updated before update on locations
  for each row execute function set_updated_at();
create trigger trg_weekly_settlements_updated before update on weekly_settlements
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Reglas de cobro por defecto (globales, org null) — §8
-- charge: full = precio de zona | fixed = fixed_amount | percent = % del precio
--         none = no se cobra | review = requiere decisión manual
-- ----------------------------------------------------------------------------

insert into billing_rules (organization_id, applies_to, rule_key, charge, percent, notes) values
  -- Se cobra
  (null, 'status', 'delivered',           'full',   null, 'Entregado'),
  (null, 'status', 'partial_delivery',    'review', null, 'Entrega parcial: definir por empresa'),
  (null, 'status', 'rejected',            'full',   null, 'Rechazado en domicilio con visita realizada'),
  (null, 'status', 'absent',              'review', null, 'Ausente: depende de si se cobra el intento'),
  (null, 'status', 'not_answered',        'review', null, 'No responde: depende de configuración'),
  (null, 'status', 'wrong_address',       'review', null, 'Dirección incorrecta con visita realizada'),
  (null, 'status', 'incomplete_address',  'review', null, null),
  (null, 'status', 'returned_to_seller',  'review', null, 'Devolución: depende de si se cobra'),
  (null, 'status', 'returned',            'review', null, null),
  (null, 'status', 'pending_return',      'review', null, null),
  (null, 'status', 'rescheduled',         'review', null, 'Reprogramado: depende de configuración'),
  (null, 'status', 'dangerous_zone',      'review', null, null),
  -- No se cobra automáticamente
  (null, 'status', 'imported',               'none', null, 'Aún sin operación'),
  (null, 'status', 'pending_classification', 'none', null, null),
  (null, 'status', 'pending_pickup',         'none', null, 'Nunca retirado'),
  (null, 'status', 'cancelled_by_ml',        'none', null, 'Cancelado (antes del retiro no se cobra; después: regla propia)'),
  (null, 'status', 'cancelled_by_client',    'none', null, null),
  (null, 'status', 'lost',                   'review', null, null),
  (null, 'status', 'damaged',                'review', null, null),
  (null, 'status', 'under_review',           'review', null, null),
  -- Estados intermedios: no se cobran hasta resolverse
  (null, 'status', 'picked_up',        'none', null, 'En proceso'),
  (null, 'status', 'at_warehouse',     'none', null, 'En proceso'),
  (null, 'status', 'classified',       'none', null, 'En proceso'),
  (null, 'status', 'assigned',         'none', null, 'En proceso'),
  (null, 'status', 'route_prep',       'none', null, 'En proceso'),
  (null, 'status', 'out_for_delivery', 'none', null, 'En proceso'),
  (null, 'status', 'visited',          'review', null, 'Visitado sin resolución');
