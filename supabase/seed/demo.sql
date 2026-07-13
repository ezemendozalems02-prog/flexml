-- ============================================================================
-- FlexControl — Datos de DEMOSTRACIÓN
-- Ejecutar SOLO en entornos de desarrollo/demo. La organización queda marcada
-- is_demo = true y la UI muestra la etiqueta "Modo demostración".
--
-- Requiere: haber creado un usuario en Supabase Auth y reemplazar
-- :OWNER_USER_ID por su UUID (o ejecutar el bloque final que lo vincula).
-- ============================================================================

do $$
declare
  v_org uuid;
  v_client1 uuid; v_client2 uuid; v_client3 uuid;
  v_conn1 uuid; v_conn2 uuid; v_conn3 uuid;
  v_zone_norte uuid; v_zone_oeste uuid; v_zone_sur uuid; v_zone_caba uuid; v_zone_centro uuid;
  v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid; v_d5 uuid;
  v_route1 uuid; v_route2 uuid;
  v_ship uuid;
  v_reason_absent uuid;
  i int;
  v_status internal_status;
  v_client uuid;
  v_conn uuid;
  v_zone uuid;
  v_driver uuid;
  v_city text; v_zip text;
begin
  -- Organización demo
  insert into organizations (name, legal_name, tax_id, email, timezone, currency, country, is_demo)
  values ('Transportes Demo SRL', 'Transportes Demo SRL', '30-11111111-1',
          'demo@flexcontrol.local', 'America/Argentina/Buenos_Aires', 'ARS', 'AR', true)
  returning id into v_org;

  insert into organization_settings (organization_id) values (v_org);

  -- Clientes
  insert into clients (organization_id, name, contact_name, email, pickup_city, pickup_zip, pickup_address)
  values (v_org, 'ElectroHogar Online', 'Marcos Pereyra', 'ventas@electrohogar.demo', 'Vicente López', '1638', 'Av. Maipú 1234')
  returning id into v_client1;
  insert into clients (organization_id, name, contact_name, email, pickup_city, pickup_zip, pickup_address)
  values (v_org, 'Moda Urbana', 'Lucía Fernández', 'hola@modaurbana.demo', 'CABA - Palermo', '1425', 'Gorriti 4521')
  returning id into v_client2;
  insert into clients (organization_id, name, contact_name, email, pickup_city, pickup_zip, pickup_address)
  values (v_org, 'Juguetería El Trompo', 'Raúl Gómez', 'pedidos@eltrompo.demo', 'Quilmes', '1878', 'Rivadavia 356')
  returning id into v_client3;

  -- Conexiones simuladas (sin tokens: is_mock = true)
  insert into marketplace_connections (organization_id, client_id, external_user_id, nickname, site_id, status, is_mock, connected_at, last_successful_sync_at)
  values (v_org, v_client1, '100001', 'ELECTROHOGAR_ML', 'MLA', 'active', true, now(), now()) returning id into v_conn1;
  insert into marketplace_connections (organization_id, client_id, external_user_id, nickname, site_id, status, is_mock, connected_at, last_successful_sync_at)
  values (v_org, v_client2, '100002', 'MODAURBANA_OFICIAL', 'MLA', 'active', true, now(), now()) returning id into v_conn2;
  insert into marketplace_connections (organization_id, client_id, external_user_id, nickname, site_id, status, is_mock, connected_at, last_successful_sync_at)
  values (v_org, v_client3, '100003', 'ELTROMPO_JUGUETES', 'MLA', 'needs_reauth', true, now() - interval '10 days', now() - interval '2 days') returning id into v_conn3;

  -- Zonas
  insert into zones (organization_id, name, color, priority) values (v_org, 'Zona Norte', '#3b82f6', 10) returning id into v_zone_norte;
  insert into zones (organization_id, name, color, priority) values (v_org, 'Zona Oeste', '#8b5cf6', 20) returning id into v_zone_oeste;
  insert into zones (organization_id, name, color, priority) values (v_org, 'Zona Sur', '#f59e0b', 30) returning id into v_zone_sur;
  insert into zones (organization_id, name, color, priority) values (v_org, 'CABA', '#10b981', 5) returning id into v_zone_caba;
  insert into zones (organization_id, name, color, priority) values (v_org, 'Centro', '#64748b', 40) returning id into v_zone_centro;

  insert into zone_rules (zone_id, rule_type, value) values
    (v_zone_norte, 'zip', '1638'), (v_zone_norte, 'zip', '1642'), (v_zone_norte, 'zip', '1648'),
    (v_zone_norte, 'city', 'San Isidro'), (v_zone_norte, 'city', 'Vicente López'), (v_zone_norte, 'city', 'Tigre'),
    (v_zone_oeste, 'zip', '1629'), (v_zone_oeste, 'city', 'Pilar'),
    (v_zone_sur, 'zip', '1878'), (v_zone_sur, 'city', 'Quilmes'),
    (v_zone_caba, 'zip', '1425'), (v_zone_caba, 'zip', '1424'),
    (v_zone_caba, 'city', 'CABA - Palermo'), (v_zone_caba, 'city', 'CABA - Caballito');

  -- Repartidores
  insert into drivers (organization_id, first_name, last_name, phone, status) values
    (v_org, 'Juan', 'Pérez', '11-5555-0001', 'active') returning id into v_d1;
  insert into drivers (organization_id, first_name, last_name, phone, status) values
    (v_org, 'Lucas', 'Díaz', '11-5555-0002', 'active') returning id into v_d2;
  insert into drivers (organization_id, first_name, last_name, phone, status) values
    (v_org, 'María', 'Sosa', '11-5555-0003', 'active') returning id into v_d3;
  insert into drivers (organization_id, first_name, last_name, phone, status) values
    (v_org, 'Pedro', 'Alonso', '11-5555-0004', 'on_route') returning id into v_d4;
  insert into drivers (organization_id, first_name, last_name, phone, status) values
    (v_org, 'Sofía', 'Ramírez', '11-5555-0005', 'on_vacation') returning id into v_d5;

  -- Rutas
  insert into routes (organization_id, code, name, date, driver_id, zone_id, status, departure_time)
  values (v_org, 'R-151', 'Norte mañana', current_date, v_d1, v_zone_norte, 'in_progress', '09:00') returning id into v_route1;
  insert into routes (organization_id, code, name, date, driver_id, zone_id, status, departure_time)
  values (v_org, 'R-152', 'CABA tarde', current_date, v_d2, v_zone_caba, 'prepared', '14:00') returning id into v_route2;

  select id into v_reason_absent from incident_reasons where code = 'recipient_absent' and organization_id is null;

  -- 50 envíos con estados variados
  for i in 1..50 loop
    v_client := case (i % 3) when 0 then v_client1 when 1 then v_client2 else v_client3 end;
    v_conn   := case (i % 3) when 0 then v_conn1   when 1 then v_conn2   else v_conn3   end;
    case (i % 5)
      when 0 then v_zone := v_zone_norte; v_city := 'San Isidro'; v_zip := '1642';
      when 1 then v_zone := v_zone_caba;  v_city := 'CABA - Palermo'; v_zip := '1425';
      when 2 then v_zone := v_zone_sur;   v_city := 'Quilmes'; v_zip := '1878';
      when 3 then v_zone := v_zone_oeste; v_city := 'Pilar'; v_zip := '1629';
      else       v_zone := null;          v_city := 'Moreno'; v_zip := '1744';
    end case;
    v_status := (array[
      'delivered','delivered','delivered','out_for_delivery','assigned',
      'pending_pickup','rescheduled','absent','cancelled_by_ml','classified'
    ]::internal_status[])[(i % 10) + 1];
    v_driver := case
      when v_status in ('delivered','out_for_delivery','assigned','rescheduled','absent')
      then (array[v_d1, v_d2, v_d3, v_d4])[(i % 4) + 1]
      else null
    end;

    insert into shipments (
      organization_id, client_id, connection_id, external_shipment_id, external_order_id,
      sold_at, title_summary, logistic_type, shipping_mode, external_status, external_tags,
      is_flex, flex_reason, flex_rule_version, internal_status, zone_id, suggested_zone_id,
      zone_method, driver_id, route_id, attempt_count,
      delivered_at, promised_date, data_source, incident_reason_id
    ) values (
      v_org, v_client, v_conn, (44000000000 + i)::text, (2000000000 + i)::text,
      now() - (i || ' hours')::interval,
      (array['1× Auriculares BT','1× Zapatillas 42','2× Remera oversize','1× Peluche 40cm','1× Lámpara LED'])[(i % 5) + 1],
      'self_service', 'me2',
      case when v_status = 'delivered' then 'delivered'
           when v_status = 'cancelled_by_ml' then 'cancelled'
           when v_status = 'out_for_delivery' then 'shipped'
           else 'ready_to_ship' end,
      array['self_service_in'],
      true, 'logistic_type_self_service', '2026-07-v1',
      v_status, v_zone, v_zone,
      case when v_zone is null then null else 'zip' end,
      v_driver,
      case when v_driver = v_d1 then v_route1 when v_driver = v_d2 then v_route2 else null end,
      case when v_status in ('delivered','absent','rescheduled') then 1 else 0 end,
      case when v_status = 'delivered' then now() - ((i % 12) || ' hours')::interval else null end,
      current_date + ((i % 3)) , 'mock',
      case when v_status = 'absent' then v_reason_absent else null end
    ) returning id into v_ship;

    insert into shipment_addresses (shipment_id, receiver_name, street, street_number, city, province, zip, country, data_source)
    values (
      v_ship,
      (array['Ana Gómez','Luis Fernández','Marta López','Diego Suárez','Carla Ruiz'])[(i % 5) + 1],
      (array['Av. Santa Fe','Belgrano','Mitre','9 de Julio','San Martín'])[(i % 5) + 1],
      (100 + i * 37)::text, v_city,
      case when v_city like 'CABA%' then 'CABA' else 'Buenos Aires' end,
      v_zip, 'AR', 'mock'
    );

    insert into shipment_events (shipment_id, organization_id, event_type, new_internal_status, new_external_status, source, note)
    values (v_ship, v_org, 'imported', 'imported', 'ready_to_ship', 'import', 'Envío demo importado');

    if v_status = 'delivered' then
      insert into shipment_events (shipment_id, organization_id, event_type, old_internal_status, new_internal_status, source, driver_id, note)
      values (v_ship, v_org, 'delivered', 'out_for_delivery', 'delivered', 'driver', v_driver, 'Entregado (demo)');
      insert into shipment_attempts (shipment_id, driver_id, attempt_number, outcome, receiver_name)
      values (v_ship, v_driver, 1, 'delivered', 'Recibido conforme');
    elsif v_status = 'absent' then
      insert into shipment_events (shipment_id, organization_id, event_type, old_internal_status, new_internal_status, source, driver_id, note)
      values (v_ship, v_org, 'attempt_failed', 'out_for_delivery', 'absent', 'driver', v_driver, 'Destinatario ausente (demo)');
      insert into shipment_attempts (shipment_id, driver_id, attempt_number, outcome, incident_reason_id)
      values (v_ship, v_driver, 1, 'failed', v_reason_absent);
    end if;
  end loop;

  raise notice 'Organización demo creada: %', v_org;
end $$;

-- ----------------------------------------------------------------------------
-- Vincular tu usuario a la organización demo (reemplazar el correo):
-- ----------------------------------------------------------------------------
-- insert into platform_users (id) select id from auth.users where email = 'TU_CORREO' on conflict do nothing;
-- insert into organization_members (organization_id, user_id, role, status, joined_at)
-- select o.id, u.id, 'owner', 'active', now()
-- from organizations o, auth.users u
-- where o.is_demo and u.email = 'TU_CORREO';
