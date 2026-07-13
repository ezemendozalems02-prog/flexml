import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/mercadolibre/sync-service";
import { processPendingNotifications } from "@/lib/mercadolibre/notifications-service";

export const maxDuration = 300;

/**
 * GET /api/cron/sync — job programado (Vercel Cron).
 * 1. Procesa notificaciones pendientes del webhook.
 * 2. Ejecuta jobs encolados (initial_import).
 * 3. Sincronización incremental de conexiones activas.
 * Autenticado con CRON_SECRET (Authorization: Bearer <secret>).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary: Record<string, unknown> = {};

  // 1. Notificaciones pendientes
  try {
    summary.notifications = await processPendingNotifications();
  } catch (err) {
    summary.notifications = { error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Jobs encolados (importación inicial)
  const { data: queued } = await admin
    .from("marketplace_sync_jobs")
    .select("id, connection_id, job_type")
    .eq("status", "queued")
    .not("connection_id", "is", null)
    .limit(5);

  const queuedResults: unknown[] = [];
  for (const job of queued ?? []) {
    // El job encolado se marca cancelado y syncConnection crea el suyo propio
    await admin.from("marketplace_sync_jobs").update({ status: "cancelled" }).eq("id", job.id);
    try {
      const stats = await syncConnection(job.connection_id!, {
        jobType: job.job_type === "initial_import" ? "initial_import" : "incremental",
      });
      queuedResults.push({ connection: job.connection_id, ...stats });
    } catch (err) {
      queuedResults.push({
        connection: job.connection_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  summary.queuedJobs = queuedResults;

  // 3. Incremental de conexiones activas (las menos recientemente sincronizadas)
  const { data: active } = await admin
    .from("marketplace_connections")
    .select("id")
    .eq("status", "active")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(10);

  const incrementalResults: unknown[] = [];
  for (const conn of active ?? []) {
    try {
      const stats = await syncConnection(conn.id, { jobType: "incremental" });
      incrementalResults.push({ connection: conn.id, ...stats });
    } catch (err) {
      incrementalResults.push({
        connection: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  summary.incremental = incrementalResults;

  return NextResponse.json({ ok: true, summary });
}
