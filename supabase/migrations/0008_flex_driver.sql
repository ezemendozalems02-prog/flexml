-- Conductor asignado en Mercado Envíos Flex ("Datos del transportista" en la
-- pantalla de Ventas de ML). Se obtiene de
-- GET /flex/sites/{site}/shipments/{id}/assignment/v1 durante el sync.
-- La respuesta documentada solo trae driver_id; el nombre se resuelve por
-- otras vías cuando ML lo expone, y el payload completo queda en _raw para
-- validar el formato real (ver docs/PENDIENTES-VALIDACION.md).
alter table shipments add column if not exists flex_driver_id   text;
alter table shipments add column if not exists flex_driver_name text;
alter table shipments add column if not exists flex_assignment_raw jsonb;
alter table shipments add column if not exists flex_assignment_at timestamptz;
