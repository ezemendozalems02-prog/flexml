import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoLibreProvider } from "./index";
import { getValidAccessToken } from "./token-service";
import { syncConnection } from "./sync-service";

/**
 * MercadoLibreNotificationsService — procesa notificaciones pendientes
 * guardadas por el webhook. Idempotente: cada recurso termina en un upsert.
 * Reintenta hasta MAX_ATTEMPTS; después queda `failed` visible en el panel.
 */

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export async function processPendingNotifications(): Promise<{
  processed: number;
  failed: number;
}> {
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("marketplace_notifications")
    .select("id, topic, resource, external_user_id, attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("received_at", { ascending: true })
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;

  for (const notif of pending ?? []) {
    await admin
      .from("marketplace_notifications")
      .update({ status: "processing", attempts: notif.attempts + 1 })
      .eq("id", notif.id);

    try {
      await processOne(notif);
      await admin
        .from("marketplace_notifications")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", notif.id);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("marketplace_notifications")
        .update({
          status: notif.attempts + 1 >= MAX_ATTEMPTS ? "discarded" : "failed",
          last_error: message,
        })
        .eq("id", notif.id);
      failed++;
    }
  }

  return { processed, failed };
}

async function processOne(notif: {
  id: string;
  topic: string;
  resource: string;
  external_user_id: string | null;
}) {
  const admin = createAdminClient();

  if (!notif.external_user_id) {
    throw new Error("Notificación sin user_id: no se puede asociar a una conexión");
  }

  const { data: conn } = await admin
    .from("marketplace_connections")
    .select("id, status")
    .eq("provider", "mercadolibre")
    .eq("external_user_id", notif.external_user_id)
    .not("status", "in", "(disconnected)")
    .maybeSingle();

  if (!conn) {
    throw new Error(`Sin conexión activa para el vendedor ${notif.external_user_id}`);
  }

  // Estrategia simple y robusta para orders/shipments: refrescar el recurso
  // puntual cuando es identificable; de lo contrario, sync incremental corto.
  if (notif.topic === "orders_v2" || notif.topic === "orders") {
    const orderId = notif.resource.split("/").pop();
    if (orderId) {
      const accessToken = await getValidAccessToken(conn.id);
      const provider = getMercadoLibreProvider();
      const order = await provider.getOrder({ accessToken }, orderId);
      // Reusar la lógica de upsert vía sync puntual: por simplicidad se
      // dispara un incremental corto que incluye la orden actualizada.
      void order;
    }
    await syncConnection(conn.id, { jobType: "incremental" });
    return;
  }

  if (notif.topic === "shipments") {
    await syncConnection(conn.id, { jobType: "incremental" });
    return;
  }

  // Otros tópicos: por ahora solo registrar como procesados.
}
