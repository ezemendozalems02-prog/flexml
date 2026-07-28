"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { syncConnection } from "@/lib/mercadolibre/sync-service";

/** Ventana de la sincronización manual: últimos 30 días. */
const MANUAL_SYNC_WINDOW_MS = 30 * 86400_000;

/**
 * Sincronización manual de una conexión desde el panel. Mientras el cron
 * de Vercel esté deshabilitado (plan Hobby), este botón es la vía principal
 * para traer novedades además del webhook en tiempo real.
 */
export async function syncNow(formData: FormData): Promise<void> {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) return;

  const session = await requireRole(["owner", "admin", "operator"]);

  // RLS acota a la propia organización; el eq extra hace explícito el chequeo
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("marketplace_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!conn) return;

  try {
    await syncConnection(connectionId, {
      jobType: "incremental",
      dateFrom: new Date(Date.now() - MANUAL_SYNC_WINDOW_MS).toISOString(),
    });
  } catch (err) {
    // El detalle queda en marketplace_connections.last_error y en los logs
    console.error("Sincronización manual falló:", err);
  }

  revalidatePath("/connections");
  revalidatePath("/shipments");
  revalidatePath("/dashboard");
}
