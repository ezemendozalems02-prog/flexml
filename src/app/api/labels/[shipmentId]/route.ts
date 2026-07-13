import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { hasPermission, shipmentInScope } from "@/lib/auth/require-permission";
import { getOrFetchLabel, logLabelAccess } from "@/lib/labels/label-service";
import type { Permission } from "@/lib/auth/permissions";

/**
 * GET /api/labels/{shipmentId}?action=view|download|print|refresh
 *
 * Flujo (§21): valida sesión → permiso → alcance (vendedor: su cliente;
 * repartidor: asignados) → obtiene/actualiza la etiqueta → registra el acceso
 * → redirige a una URL firmada temporal. El access token de ML nunca sale del
 * servidor y no hay URLs públicas permanentes.
 */

const ACTION_PERMISSION: Record<string, Permission> = {
  view: "labels.view",
  download: "labels.download",
  print: "labels.print",
  refresh: "labels.refresh",
};

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ shipmentId: string }> }
) {
  const { shipmentId } = await ctx.params;
  const action = request.nextUrl.searchParams.get("action") ?? "view";
  const permission = ACTION_PERMISSION[action];
  if (!permission) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const session = await requireSession();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");

  // 1. Permiso por acción (backend, no solo UI)
  if (!(await hasPermission(session, permission))) {
    await logLabelAccess({
      labelId: null,
      shipmentId,
      userId: session.userId,
      action: action as "view",
      result: "denied",
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Sin permiso para esta acción" }, { status: 403 });
  }

  // 2. Alcance: el envío debe pertenecer a la org y al ámbito del rol
  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, client_id, driver_id")
    .eq("id", shipmentId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!shipment || !shipmentInScope(session, shipment)) {
    await logLabelAccess({
      labelId: null,
      shipmentId,
      userId: session.userId,
      action: action as "view",
      result: "denied",
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Envío fuera de tu alcance" }, { status: 403 });
  }

  // 3. Obtener etiqueta (caché privada o ML)
  const outcome = await getOrFetchLabel(shipmentId, {
    force: action === "refresh",
    userId: session.userId,
  });

  if (!outcome.ok) {
    await logLabelAccess({
      labelId: null,
      shipmentId,
      userId: session.userId,
      action: action as "view",
      result: outcome.status === "ml_error" ? "error" : "unavailable",
      ip,
      userAgent,
    });
    return NextResponse.json(
      { error: "label_unavailable", message: outcome.userMessage, status: outcome.status },
      { status: 200 }
    );
  }

  // 4. Registrar acceso y entregar URL firmada temporal
  await logLabelAccess({
    labelId: outcome.labelId,
    shipmentId,
    userId: session.userId,
    action: action as "view",
    result: "ok",
    ip,
    userAgent,
  });

  if (action === "print" || request.nextUrl.searchParams.get("json") === "1") {
    return NextResponse.json({
      ok: true,
      url: outcome.signedUrl,
      fileName: outcome.fileName,
      format: outcome.format,
      version: outcome.version,
    });
  }

  return NextResponse.redirect(outcome.signedUrl);
}
