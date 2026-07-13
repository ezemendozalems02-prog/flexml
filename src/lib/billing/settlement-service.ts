import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureShipmentCalculation } from "./shipment-billing";
import { findOverlappingRates, formatMoney, type RateWindow } from "./engine";

/**
 * WeeklySettlementService — genera el borrador de liquidación semanal por
 * cliente (§13–§19): recalcula precios pendientes, agrega por cuenta de ML y
 * zona, suma adicionales, detecta problemas y congela el detalle.
 */

export interface ValidationIssue {
  type:
    | "no_zone"
    | "no_rate"
    | "review"
    | "overlapping_rates"
    | "unclassified_location";
  message: string;
  count?: number;
}

export interface GenerateResult {
  settlementId: string;
  number: string;
  total: number;
  issues: ValidationIssue[];
}

export async function generateWeeklySettlement(params: {
  organizationId: string;
  clientId: string;
  weekStart: string; // YYYY-MM-DD (lunes)
  userId: string;
}): Promise<GenerateResult> {
  const admin = createAdminClient();
  const periodStart = params.weekStart;
  const periodEnd = addDays(periodStart, 6);
  const periodEndExclusive = addDays(periodStart, 7);

  // 1. Envíos del cliente en el período (§18.1)
  const { data: shipments } = await admin
    .from("shipments")
    .select("id, connection_id, internal_status, attempt_count")
    .eq("organization_id", params.organizationId)
    .eq("client_id", params.clientId)
    .gte("created_at", `${periodStart}T00:00:00Z`)
    .lt("created_at", `${periodEndExclusive}T00:00:00Z`)
    .limit(5000);

  // 2–7. Asegurar cálculo congelado por envío (recalcula lo no-override)
  for (const s of shipments ?? []) {
    await ensureShipmentCalculation(s.id, { force: true });
  }

  const shipmentIds = (shipments ?? []).map((s) => s.id);
  const { data: calcs } = shipmentIds.length
    ? await admin
        .from("shipment_rate_calculations")
        .select(
          `*, shipments!inner(external_shipment_id, internal_status, attempt_count, driver_id),
           zones(id, name), shipment_charge_items(*)`
        )
        .in("shipment_id", shipmentIds)
    : { data: [] };

  // 11–13. Validaciones (§19)
  const issues: ValidationIssue[] = [];
  const noZone = (calcs ?? []).filter((c) => c.status === "no_zone").length;
  const noRate = (calcs ?? []).filter((c) => c.status === "no_rate").length;
  const review = (calcs ?? []).filter(
    (c) => c.status === "review" || (c.requires_review && c.status !== "no_zone" && c.status !== "no_rate")
  ).length;
  if (noZone > 0)
    issues.push({ type: "no_zone", count: noZone, message: `${noZone} envío(s) sin zona / localidad sin clasificar` });
  if (noRate > 0)
    issues.push({ type: "no_rate", count: noRate, message: `${noRate} envío(s) cobrables sin tarifa aplicable` });
  if (review > 0)
    issues.push({ type: "review", count: review, message: `${review} envío(s) requieren decisión manual de cobro` });

  // Tarifas superpuestas
  const { data: allRates } = await admin
    .from("zone_rates")
    .select("id, zone_id, price, currency, retry_price, return_price, reschedule_price, additional_package_price, valid_from, valid_to, status")
    .eq("organization_id", params.organizationId);
  const byZone = new Map<string, RateWindow[]>();
  for (const r of (allRates ?? []) as unknown as Array<RateWindow & { zone_id: string }>) {
    const list = byZone.get(r.zone_id) ?? [];
    list.push(r);
    byZone.set(r.zone_id, list);
  }
  let overlapCount = 0;
  for (const rates of byZone.values()) overlapCount += findOverlappingRates(rates).length;
  if (overlapCount > 0)
    issues.push({ type: "overlapping_rates", count: overlapCount, message: `${overlapCount} superposición(es) de vigencia en tarifas de zona` });

  // 9–10. Agregación por cuenta de ML y zona (§12)
  const { data: connections } = await admin
    .from("marketplace_connections")
    .select("id, nickname")
    .eq("client_id", params.clientId);
  const connName = new Map((connections ?? []).map((c) => [c.id, c.nickname ?? "Cuenta"]));

  type ZoneAgg = { zone_id: string | null; zone_name: string; count: number; unit_price: number; subtotal: number };
  const accountAgg = new Map<string, { zones: Map<string, ZoneAgg>; subtotal: number }>();
  const conceptAgg = new Map<string, { quantity: number; amount: number }>();
  let shipmentsSubtotal = 0;
  let additionalsSubtotal = 0;

  const itemsToInsert: Array<Record<string, unknown>> = [];

  for (const calc of calcs ?? []) {
    const accKey = calc.connection_id ?? "sin-cuenta";
    const zone = calc.zones as unknown as { id: string; name: string } | null;
    const chargeItems = (calc.shipment_charge_items ?? []) as Array<{
      concept: string;
      description: string | null;
      quantity: number;
      unit_price: number;
      amount: number;
      billable: boolean;
    }>;

    if (!accountAgg.has(accKey)) accountAgg.set(accKey, { zones: new Map(), subtotal: 0 });
    const acc = accountAgg.get(accKey)!;

    for (const item of chargeItems) {
      const amount = Number(item.amount);
      const billable = calc.billable && item.billable;

      itemsToInsert.push({
        connection_key: accKey,
        shipment_id: calc.shipment_id,
        calculation_id: calc.id,
        zone_id: calc.zone_id,
        concept: item.concept,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        amount: billable ? amount : 0,
        currency: calc.currency,
        billable,
        excluded: !billable,
        exclusion_reason: billable ? null : calc.status,
      });

      if (!billable) continue;

      if (item.concept === "delivery") {
        shipmentsSubtotal += amount;
        acc.subtotal += amount;
        const zKey = calc.zone_id ?? "sin-zona";
        const zAgg = acc.zones.get(zKey) ?? {
          zone_id: calc.zone_id,
          zone_name: zone?.name ?? "Sin zona",
          count: 0,
          unit_price: Number(item.unit_price),
          subtotal: 0,
        };
        zAgg.count += item.quantity;
        zAgg.subtotal += amount;
        zAgg.unit_price = Number(item.unit_price); // último precio unitario visto
        acc.zones.set(zKey, zAgg);
      } else {
        additionalsSubtotal += amount;
        acc.subtotal += amount;
        const cAgg = conceptAgg.get(item.concept) ?? { quantity: 0, amount: 0 };
        cAgg.quantity += item.quantity;
        cAgg.amount += amount;
        conceptAgg.set(item.concept, cAgg);
      }
    }

    // Envíos no cobrables sin items: dejarlos visibles en el detalle (§15)
    if (chargeItems.length === 0) {
      itemsToInsert.push({
        connection_key: accKey,
        shipment_id: calc.shipment_id,
        calculation_id: calc.id,
        zone_id: calc.zone_id,
        concept: "delivery",
        quantity: 1,
        unit_price: 0,
        amount: 0,
        currency: calc.currency,
        billable: false,
        excluded: true,
        exclusion_reason: calc.status,
      });
    }
  }

  const total = round2(shipmentsSubtotal + additionalsSubtotal);

  // 14. Crear liquidación en borrador (nueva versión si ya existía el período)
  const { data: prev } = await admin
    .from("weekly_settlements")
    .select("version")
    .eq("organization_id", params.organizationId)
    .eq("client_id", params.clientId)
    .eq("period_start", periodStart)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (prev?.version ?? 0) + 1;

  const { count: existingCount } = await admin
    .from("weekly_settlements")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId);
  const number = `LIQ-${periodStart.slice(0, 4)}-${String((existingCount ?? 0) + 1).padStart(4, "0")}`;

  const counts = {
    shipments: shipmentIds.length,
    billable: (calcs ?? []).filter((c) => c.billable).length,
    not_billable: (calcs ?? []).filter((c) => !c.billable).length,
    concepts: Object.fromEntries(conceptAgg),
  };

  const { data: settlement, error } = await admin
    .from("weekly_settlements")
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      number,
      period_start: periodStart,
      period_end: periodEnd,
      status: issues.length > 0 ? "pending_review" : "draft",
      shipments_subtotal: round2(shipmentsSubtotal),
      additionals_subtotal: round2(additionalsSubtotal),
      adjustments_total: 0,
      total,
      counts,
      validation_issues: issues,
      version,
      generated_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !settlement) throw new Error(`No se pudo crear la liquidación: ${error?.message}`);

  // Cuentas
  const accountIdByKey = new Map<string, string>();
  for (const [key, agg] of accountAgg) {
    const { data: accRow } = await admin
      .from("weekly_settlement_accounts")
      .insert({
        settlement_id: settlement.id,
        connection_id: key === "sin-cuenta" ? null : key,
        nickname: key === "sin-cuenta" ? "Sin cuenta" : connName.get(key) ?? "Cuenta",
        zone_summary: [...agg.zones.values()],
        subtotal: round2(agg.subtotal),
      })
      .select("id")
      .single();
    if (accRow) accountIdByKey.set(key, accRow.id);
  }

  // Detalle
  if (itemsToInsert.length > 0) {
    await admin.from("weekly_settlement_items").insert(
      itemsToInsert.map(({ connection_key, ...item }) => ({
        ...item,
        settlement_id: settlement.id,
        account_id: accountIdByKey.get(connection_key as string) ?? null,
      }))
    );
  }

  // Versión inicial (snapshot para auditoría)
  await admin.from("weekly_settlement_versions").insert({
    settlement_id: settlement.id,
    version,
    snapshot: { counts, shipmentsSubtotal, additionalsSubtotal, total, issues },
    reason: "Generación automática",
    created_by: params.userId,
  });

  await admin.from("audit_logs").insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    action: "settlement.generated",
    resource_type: "weekly_settlement",
    resource_id: settlement.id,
    new_data: { number, total, issues: issues.length },
  });

  return { settlementId: settlement.id, number, total, issues };
}

/** Recalcula totales tras agregar ajustes (§20). */
export async function refreshSettlementTotals(settlementId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: s }, { data: adjustments }] = await Promise.all([
    admin
      .from("weekly_settlements")
      .select("shipments_subtotal, additionals_subtotal")
      .eq("id", settlementId)
      .single(),
    admin.from("weekly_settlement_adjustments").select("amount").eq("settlement_id", settlementId),
  ]);
  if (!s) return;
  const adjTotal = round2((adjustments ?? []).reduce((acc, a) => acc + Number(a.amount), 0));
  await admin
    .from("weekly_settlements")
    .update({
      adjustments_total: adjTotal,
      total: round2(Number(s.shipments_subtotal) + Number(s.additionals_subtotal) + adjTotal),
    })
    .eq("id", settlementId);
}

/** Mensaje resumido para WhatsApp (§22), generado con datos reales. */
export function buildWhatsAppMessage(params: {
  clientName: string;
  periodStart: string;
  periodEnd: string;
  zoneLines: Array<{ zone: string; count: number; subtotal: number }>;
  concepts: Array<{ label: string; amount: number }>;
  adjustmentsTotal: number;
  total: number;
  currency: string;
}): string {
  const fmtDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(day)}/${Number(m)}`;
  };
  const lines: string[] = [
    `Hola ${params.clientName}. Te compartimos el resumen de entregas Flex correspondiente a la semana del ${fmtDate(params.periodStart)} al ${fmtDate(params.periodEnd)}.`,
    "",
  ];
  for (const z of params.zoneLines) {
    lines.push(`${z.zone}: ${z.count} envíos — ${formatMoney(z.subtotal, params.currency)}`);
  }
  for (const c of params.concepts) {
    if (c.amount !== 0) lines.push(`${c.label}: ${formatMoney(c.amount, params.currency)}`);
  }
  if (params.adjustmentsTotal !== 0) {
    lines.push(`Ajustes: ${formatMoney(params.adjustmentsTotal, params.currency)}`);
  }
  lines.push("", `Total de la semana: ${formatMoney(params.total, params.currency)}.`, "", "Adjuntamos el detalle completo de los envíos.");
  return lines.join("\n");
}

export const CONCEPT_LABELS: Record<string, string> = {
  delivery: "Envíos",
  retry: "Reintentos",
  return: "Devoluciones",
  reschedule: "Reprogramaciones",
  additional_package: "Paquetes adicionales",
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
