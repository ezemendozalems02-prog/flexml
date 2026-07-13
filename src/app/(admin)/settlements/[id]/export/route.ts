import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { internalStatusLabel } from "@/lib/domain/statuses";
import { CONCEPT_LABELS } from "@/lib/billing/settlement-service";

/**
 * GET /settlements/[id]/export — detalle completo de la liquidación en CSV
 * (compatible con Excel: separador ; y BOM). Registra la exportación.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("weekly_settlements")
    .select("id, number, period_start, period_end, currency, total, clients(name)")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!s) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const { data: items } = await supabase
    .from("weekly_settlement_items")
    .select(
      `concept, quantity, unit_price, amount, billable, excluded, exclusion_reason,
       zones(name),
       weekly_settlement_accounts(nickname),
       shipments(external_shipment_id, external_order_id, internal_status, attempt_count, created_at,
                 drivers(first_name, last_name), shipment_addresses(city))`
    )
    .eq("settlement_id", id)
    .limit(5000);

  const esc = (v: string | number | null | undefined) => {
    const str = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = [
    "Fecha",
    "ID envío",
    "ID venta",
    "Cuenta ML",
    "Localidad",
    "Zona",
    "Estado",
    "Repartidor",
    "Intentos",
    "Concepto",
    "Cantidad",
    "Precio unitario",
    "Importe",
    "Cobrado",
    "Motivo no cobrado",
  ].join(";");

  const lines = (items ?? []).map((it) => {
    const ship = it.shipments as unknown as {
      external_shipment_id: string | null;
      external_order_id: string | null;
      internal_status: string;
      attempt_count: number;
      created_at: string;
      drivers: { first_name: string; last_name: string } | null;
      shipment_addresses: { city: string | null } | null;
    } | null;
    return [
      esc(ship ? new Date(ship.created_at).toLocaleDateString("es-AR") : ""),
      esc(ship?.external_shipment_id),
      esc(ship?.external_order_id),
      esc((it.weekly_settlement_accounts as unknown as { nickname: string | null } | null)?.nickname),
      esc(ship?.shipment_addresses?.city),
      esc((it.zones as unknown as { name: string } | null)?.name ?? "Sin zona"),
      esc(ship ? internalStatusLabel(ship.internal_status) : ""),
      esc(ship?.drivers ? `${ship.drivers.first_name} ${ship.drivers.last_name}` : ""),
      esc(ship?.attempt_count ?? ""),
      esc(CONCEPT_LABELS[it.concept] ?? it.concept),
      esc(it.quantity),
      esc(Number(it.unit_price)),
      esc(it.excluded ? 0 : Number(it.amount)),
      esc(it.excluded ? "No" : "Sí"),
      esc(it.exclusion_reason),
    ].join(";");
  });

  await supabase.from("audit_logs").insert({
    organization_id: session.organization.id,
    user_id: session.userId,
    action: "settlement.exported",
    resource_type: "weekly_settlement",
    resource_id: s.id,
    new_data: { rows: lines.length },
  });

  const csv = "﻿" + [header, ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${s.number}.csv"`,
    },
  });
}
