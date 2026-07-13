import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoLibreProvider } from "./index";
import { classifyFlex } from "./flex-classifier";
import { getValidAccessToken } from "./token-service";
import { classifyZone } from "@/lib/zones/classify";
import { ensureShipmentCalculation } from "@/lib/billing/shipment-billing";
import type { MLOrder, MLShipment } from "./provider";
import { MLApiError } from "./adapters/http";

/**
 * MercadoLibreSyncService — sincronización idempotente de órdenes y envíos.
 *
 * Garantías:
 *  - Upsert por (connection_id, external_order_id / external_shipment_id):
 *    el mismo evento nunca duplica registros.
 *  - Cambios de estado externo generan shipment_events (historial completo).
 *  - El estado interno NUNCA se pisa por la sincronización, salvo la
 *    detección de cancelación externa (que mueve a cancelled_by_ml solo si
 *    el envío no fue entregado internamente) — con evento de por medio.
 *  - Cada corrida registra job + logs en marketplace_sync_jobs/_logs.
 */

const PAGE_SIZE = 50;
const MAX_PAGES_PER_RUN = 10; // troceo por lotes para caber en el timeout

interface SyncStats {
  processed: number;
  created: number;
  updated: number;
  failed: number;
}

export async function syncConnection(
  connectionId: string,
  opts: { jobType?: "initial_import" | "incremental"; dateFrom?: string } = {}
): Promise<SyncStats> {
  const admin = createAdminClient();
  const jobType = opts.jobType ?? "incremental";

  const { data: conn, error: connError } = await admin
    .from("marketplace_connections")
    .select("id, organization_id, client_id, external_user_id, status, import_from, is_mock")
    .eq("id", connectionId)
    .single();
  if (connError || !conn) throw new Error("Conexión no encontrada");

  const { data: job } = await admin
    .from("marketplace_sync_jobs")
    .insert({
      organization_id: conn.organization_id,
      connection_id: conn.id,
      job_type: jobType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobId = job?.id as string;

  await admin
    .from("marketplace_connections")
    .update({ status: "syncing", last_sync_at: new Date().toISOString() })
    .eq("id", conn.id);

  const stats: SyncStats = { processed: 0, created: 0, updated: 0, failed: 0 };
  const startedAt = Date.now();

  try {
    const accessToken = await getValidAccessToken(conn.id);
    const provider = getMercadoLibreProvider();
    const creds = { accessToken };

    const dateFrom =
      opts.dateFrom ??
      (jobType === "incremental"
        ? new Date(Date.now() - 3 * 86400_000).toISOString()
        : conn.import_from ?? undefined);

    let offset = 0;
    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const result = await provider.searchOrders(creds, conn.external_user_id, {
        offset,
        limit: PAGE_SIZE,
        dateFrom,
      });

      for (const order of result.results) {
        try {
          const outcome = await upsertOrderWithShipment(conn, order, creds, jobId);
          stats.processed++;
          if (outcome === "created") stats.created++;
          else stats.updated++;
        } catch (err) {
          stats.failed++;
          await logSync(jobId, conn.id, "error", String(order.id), errMessage(err));
          if (err instanceof MLApiError && !err.isRetryable) {
            // error permanente en un recurso: continuar con el resto
            continue;
          }
        }
      }

      offset += PAGE_SIZE;
      if (offset >= result.paging.total) break;
    }

    await admin
      .from("marketplace_sync_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        processed_count: stats.processed,
        success_count: stats.processed - stats.failed,
        failure_count: stats.failed,
      })
      .eq("id", jobId);

    await admin
      .from("marketplace_connections")
      .update({
        status: "active",
        last_successful_sync_at: new Date().toISOString(),
        last_error: null,
        consecutive_errors: 0,
      })
      .eq("id", conn.id);

    return stats;
  } catch (err) {
    const message = errMessage(err);
    await admin
      .from("marketplace_sync_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        processed_count: stats.processed,
        failure_count: stats.failed + 1,
        error: message,
      })
      .eq("id", jobId);

    const { data: current } = await admin
      .from("marketplace_connections")
      .select("consecutive_errors")
      .eq("id", conn.id)
      .single();

    await admin
      .from("marketplace_connections")
      .update({
        status: "error",
        last_error: message,
        consecutive_errors: (current?.consecutive_errors ?? 0) + 1,
      })
      .eq("id", conn.id);

    throw err;
  }
}

type ConnCtx = {
  id: string;
  organization_id: string;
  client_id: string;
  is_mock: boolean;
};

async function upsertOrderWithShipment(
  conn: ConnCtx,
  order: MLOrder,
  creds: { accessToken: string },
  jobId: string
): Promise<"created" | "updated"> {
  const admin = createAdminClient();
  const provider = getMercadoLibreProvider();

  // 1. Upsert de la orden
  const { data: orderRow, error: orderErr } = await admin
    .from("orders")
    .upsert(
      {
        organization_id: conn.organization_id,
        client_id: conn.client_id,
        connection_id: conn.id,
        external_order_id: String(order.id),
        pack_id: order.pack_id ? String(order.pack_id) : null,
        external_seller_id: String(order.seller.id),
        external_buyer_id: order.buyer ? String(order.buyer.id) : null,
        sold_at: order.date_created,
        total_amount: order.total_amount ?? null,
        currency: order.currency_id ?? null,
        external_status: order.status,
        raw_payload: order.raw ?? null,
        data_source: conn.is_mock ? "mock" : "mercadolibre",
      },
      { onConflict: "connection_id,external_order_id" }
    )
    .select("id")
    .single();
  if (orderErr || !orderRow) throw new Error(`upsert order: ${orderErr?.message}`);

  // items (reemplazo simple: la orden es la fuente de verdad)
  await admin.from("order_items").delete().eq("order_id", orderRow.id);
  if (order.order_items.length > 0) {
    await admin.from("order_items").insert(
      order.order_items.map((it) => ({
        order_id: orderRow.id,
        external_item_id: it.item.id,
        title: it.item.title,
        sku: it.item.seller_sku ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        currency: it.currency_id,
      }))
    );
  }

  // 2. Envío (si la orden tiene shipping id)
  if (!order.shipping?.id) {
    await logSync(jobId, conn.id, "warn", String(order.id), "Orden sin envío asociado");
    return "updated";
  }

  const shipment = await provider.getShipment(creds, String(order.shipping.id));
  return upsertShipment(conn, order, orderRow.id, shipment);
}

async function upsertShipment(
  conn: ConnCtx,
  order: MLOrder,
  localOrderId: string,
  shipment: MLShipment
): Promise<"created" | "updated"> {
  const admin = createAdminClient();
  const flex = classifyFlex(shipment);

  const { data: existing } = await admin
    .from("shipments")
    .select("id, external_status, external_substatus, internal_status")
    .eq("connection_id", conn.id)
    .eq("external_shipment_id", String(shipment.id))
    .maybeSingle();

  const addr = shipment.receiver_address;
  const promised = shipment.shipping_option?.estimated_delivery_time;
  const titleSummary = order.order_items
    .map((it) => `${it.quantity}× ${it.item.title}`)
    .join(" · ");

  const shipmentValues = {
    organization_id: conn.organization_id,
    client_id: conn.client_id,
    connection_id: conn.id,
    order_id: localOrderId,
    external_shipment_id: String(shipment.id),
    external_order_id: String(order.id),
    pack_id: order.pack_id ? String(order.pack_id) : null,
    external_seller_id: String(order.seller.id),
    site_id: shipment.site_id ?? null,
    sold_at: order.date_created,
    title_summary: titleSummary || null,
    package_count: 1,
    currency: order.currency_id ?? null,
    logistic_type: shipment.logistic_type ?? null,
    shipping_mode: shipment.mode ?? null,
    service_id: shipment.service_id ? String(shipment.service_id) : null,
    promised_date: promised?.date ? promised.date.slice(0, 10) : null,
    external_status: shipment.status,
    external_substatus: shipment.substatus ?? null,
    external_updated_at: shipment.last_updated ?? null,
    external_tags: shipment.tags ?? [],
    is_flex: flex.isFlex,
    flex_reason: flex.reason,
    flex_rule_version: flex.ruleVersion,
    data_incomplete: !addr?.street_name || !addr?.zip_code,
    data_source: conn.is_mock ? "mock" : "mercadolibre",
    last_synced_at: new Date().toISOString(),
    last_change_source: "mercadolibre" as const,
    raw_payload: shipment.raw ?? null,
  };

  if (!existing) {
    // Clasificar zona al importar
    const zoneMatch = await classifyZone(conn.organization_id, {
      zip: addr?.zip_code,
      city: addr?.city?.name,
      neighborhood: addr?.neighborhood?.name,
      district: addr?.municipality?.name,
      province: addr?.state?.name,
    });

    const { data: created, error } = await admin
      .from("shipments")
      .insert({
        ...shipmentValues,
        internal_status: zoneMatch ? "classified" : "pending_classification",
        zone_id: zoneMatch?.zoneId ?? null,
        suggested_zone_id: zoneMatch?.zoneId ?? null,
        zone_method: zoneMatch?.method ?? null,
        zone_confidence: zoneMatch?.confidence ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`insert shipment: ${error?.message}`);

    await upsertAddress(created.id, shipment);

    await admin.from("shipment_events").insert({
      shipment_id: created.id,
      organization_id: conn.organization_id,
      event_type: "imported",
      new_internal_status: zoneMatch ? "classified" : "pending_classification",
      new_external_status: shipment.status,
      source: "mercadolibre",
      note: zoneMatch
        ? `Importado y clasificado automáticamente (${zoneMatch.method})`
        : "Importado — sin zona",
      metadata: { flex },
    });

    // Determinar y congelar el precio del envío (mejor esfuerzo: la
    // liquidación semanal recalcula lo pendiente)
    try {
      await ensureShipmentCalculation(created.id);
    } catch (err) {
      console.error("Cálculo de precio diferido:", err);
    }
    return "created";
  }

  // Actualización: registrar cambio de estado externo si lo hubo
  const externalChanged =
    existing.external_status !== shipment.status ||
    existing.external_substatus !== (shipment.substatus ?? null);

  const { error: updErr } = await admin
    .from("shipments")
    .update(shipmentValues)
    .eq("id", existing.id);
  if (updErr) throw new Error(`update shipment: ${updErr.message}`);

  await upsertAddress(existing.id, shipment);

  if (externalChanged) {
    await admin.from("shipment_events").insert({
      shipment_id: existing.id,
      organization_id: conn.organization_id,
      event_type: "external_status_change",
      old_external_status: existing.external_status,
      new_external_status: shipment.status,
      source: "scheduled_sync",
      note: shipment.substatus ? `Subestado: ${shipment.substatus}` : null,
    });

    // Cancelación externa: mover estado interno solo si no fue entregado
    if (
      shipment.status === "cancelled" &&
      existing.internal_status !== "delivered" &&
      !existing.internal_status.startsWith("cancelled")
    ) {
      await admin
        .from("shipments")
        .update({ internal_status: "cancelled_by_ml", requires_review: true })
        .eq("id", existing.id);
      await admin.from("shipment_events").insert({
        shipment_id: existing.id,
        organization_id: conn.organization_id,
        event_type: "status_change",
        old_internal_status: existing.internal_status,
        new_internal_status: "cancelled_by_ml",
        source: "scheduled_sync",
        note: "Cancelación detectada en Mercado Libre",
      });
    }
  }
  return "updated";
}

async function upsertAddress(shipmentId: string, shipment: MLShipment) {
  const admin = createAdminClient();
  const addr = shipment.receiver_address;
  if (!addr) return;

  // No pisar direcciones editadas manualmente
  const { data: current } = await admin
    .from("shipment_addresses")
    .select("manually_overridden")
    .eq("shipment_id", shipmentId)
    .maybeSingle();
  if (current?.manually_overridden) return;

  await admin.from("shipment_addresses").upsert(
    {
      shipment_id: shipmentId,
      receiver_name: addr.receiver_name ?? null,
      street: addr.street_name ?? null,
      street_number: addr.street_number ?? null,
      reference: addr.comment ?? null,
      neighborhood: addr.neighborhood?.name ?? null,
      city: addr.city?.name ?? null,
      district: addr.municipality?.name ?? null,
      province: addr.state?.name ?? null,
      zip: addr.zip_code ?? null,
      country: addr.country?.id ?? "AR",
      lat: addr.latitude ?? null,
      lng: addr.longitude ?? null,
      phone: addr.receiver_phone ?? null,
      data_source: "mercadolibre",
    },
    { onConflict: "shipment_id" }
  );
}

async function logSync(
  jobId: string,
  connectionId: string,
  level: "info" | "warn" | "error",
  resource: string,
  message: string
) {
  const admin = createAdminClient();
  await admin.from("marketplace_sync_logs").insert({
    job_id: jobId,
    connection_id: connectionId,
    level,
    resource,
    message,
  });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
