-- ============================================================================
-- FlexControl — Seed de facturación para la organización DEMO
-- Ejecutar DESPUÉS de demo.sql y de la migración 0003.
-- Crea localidades con alias, tarifas por zona y una tarifa personalizada.
-- ============================================================================

do $$
declare
  v_org uuid;
  v_zone_norte uuid; v_zone_oeste uuid; v_zone_sur uuid; v_zone_caba uuid;
  v_client1 uuid;
  v_loc uuid;
begin
  select id into v_org from organizations where is_demo limit 1;
  if v_org is null then
    raise exception 'No existe organización demo: ejecutar primero demo.sql';
  end if;

  select id into v_zone_norte from zones where organization_id = v_org and name = 'Zona Norte';
  select id into v_zone_oeste from zones where organization_id = v_org and name = 'Zona Oeste';
  select id into v_zone_sur   from zones where organization_id = v_org and name = 'Zona Sur';
  select id into v_zone_caba  from zones where organization_id = v_org and name = 'CABA';
  select id into v_client1 from clients where organization_id = v_org and name = 'ElectroHogar Online';

  -- Localidades con alias (variantes de escritura de ML)
  insert into locations (organization_id, name, normalized_name, province, zip, zone_id)
  values (v_org, 'San Isidro', 'san isidro', 'Buenos Aires', '1642', v_zone_norte)
  returning id into v_loc;
  insert into location_aliases (organization_id, location_id, alias, normalized_alias) values
    (v_org, v_loc, 'S. Isidro', 's isidro');

  insert into locations (organization_id, name, normalized_name, province, zip, zone_id)
  values (v_org, 'Vicente López', 'vicente lopez', 'Buenos Aires', '1638', v_zone_norte)
  returning id into v_loc;
  insert into location_aliases (organization_id, location_id, alias, normalized_alias) values
    (v_org, v_loc, 'Vte. López', 'vte lopez');

  insert into locations (organization_id, name, normalized_name, province, zip, zone_id) values
    (v_org, 'Tigre', 'tigre', 'Buenos Aires', '1648', v_zone_norte),
    (v_org, 'Pilar', 'pilar', 'Buenos Aires', '1629', v_zone_oeste),
    (v_org, 'Quilmes', 'quilmes', 'Buenos Aires', '1878', v_zone_sur),
    (v_org, 'CABA - Palermo', 'caba - palermo', 'CABA', '1425', v_zone_caba),
    (v_org, 'CABA - Caballito', 'caba - caballito', 'CABA', '1424', v_zone_caba);

  -- Tarifas generales vigentes (precios de ejemplo)
  insert into zone_rates (organization_id, zone_id, price, retry_price, return_price, additional_package_price, valid_from) values
    (v_org, v_zone_caba,  5000, 2500, 3500, 800, '2026-01-01'),
    (v_org, v_zone_norte, 6500, 3000, 4000, 1000, '2026-01-01'),
    (v_org, v_zone_sur,   6500, 3000, 4000, 1000, '2026-01-01'),
    (v_org, v_zone_oeste, 8000, 3500, 5000, 1200, '2026-01-01');

  -- Historial: Zona Norte costaba menos hasta el 30/06
  update zone_rates set valid_from = '2026-07-01'
   where organization_id = v_org and zone_id = v_zone_norte;
  insert into zone_rates (organization_id, zone_id, price, retry_price, return_price, valid_from, valid_to) values
    (v_org, v_zone_norte, 6000, 2800, 3800, '2026-01-01', '2026-06-30');

  -- Tarifa personalizada: ElectroHogar paga menos en CABA
  insert into client_zone_rates (organization_id, client_id, zone_id, price, retry_price, return_price, valid_from) values
    (v_org, v_client1, v_zone_caba, 4800, 2300, 3300, '2026-01-01');

  -- Modalidades de reintento de ejemplo
  update clients set retry_billing_mode = 'per_visit'  where organization_id = v_org and name = 'ElectroHogar Online';
  update clients set retry_billing_mode = 'plus_retry' where organization_id = v_org and name = 'Moda Urbana';

  raise notice 'Seed de facturación demo aplicado a %', v_org;
end $$;
