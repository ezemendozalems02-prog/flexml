-- El upsert de órdenes usa ON CONFLICT (connection_id, external_order_id),
-- pero Postgres no puede inferir índices únicos PARCIALES (con WHERE), así
-- que todas las órdenes de la sincronización fallaban con "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification".
-- El índice completo mantiene la misma semántica: con NULLS DISTINCT (el
-- default), las filas manuales sin conexión (NULL) no chocan entre sí.
drop index if exists uq_orders_external;
create unique index uq_orders_external on orders(connection_id, external_order_id);

-- Mismo patrón en shipments: hoy no se upsertea por ese par, pero se alinea
-- para que un futuro ON CONFLICT no repita este bug.
drop index if exists uq_shipments_external;
create unique index uq_shipments_external on shipments(connection_id, external_shipment_id);
