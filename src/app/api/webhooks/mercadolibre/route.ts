import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/mercadolibre
 * Endpoint de notificaciones de Mercado Libre.
 * Contrato: responder < 500 ms. Solo valida la estructura, persiste el
 * evento bruto con dedupe y responde 200. El procesamiento real lo hace
 * el cron de sync leyendo marketplace_notifications (status=pending).
 */

const notificationSchema = z.object({
  _id: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  topic: z.string(),
  resource: z.string(),
  user_id: z.union([z.string(), z.number()]).optional(),
  application_id: z.union([z.string(), z.number()]).optional(),
  sent: z.string().optional(),
  attempts: z.number().optional(),
  received: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = notificationSchema.safeParse(payload);
  if (!parsed.success) {
    // Estructura desconocida: registrar como descartada para diagnóstico
    const admin = createAdminClient();
    await admin.from("marketplace_notifications").insert({
      topic: "unknown",
      resource: "unknown",
      payload: payload as Record<string, unknown>,
      status: "discarded",
      last_error: "Estructura no reconocida",
    });
    return NextResponse.json({ ok: true });
  }

  const n = parsed.data;
  const admin = createAdminClient();

  // Dedupe por (topic, resource, external_id): el mismo evento no se procesa dos veces
  const { error } = await admin.from("marketplace_notifications").insert({
    external_id: n._id ?? (n.id != null ? String(n.id) : null),
    topic: n.topic,
    resource: n.resource,
    external_user_id: n.user_id != null ? String(n.user_id) : null,
    payload: payload as Record<string, unknown>,
    status: "pending",
  });

  if (error && !error.message.includes("duplicate")) {
    console.error("Error guardando notificación ML:", error.message);
    // Responder 200 igualmente: ML reintenta y el evento se recupera por sync programada
  }

  return NextResponse.json({ ok: true });
}
