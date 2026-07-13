import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocationName } from "./normalization";
import { resolveLocationByCity } from "./location-service";
import {
  computeShipmentCharge,
  resolveRate,
  type BillingRule,
  type RateWindow,
  type RetryBillingMode,
} from "./engine";

/**
 * ShipmentBillingService (orquestación) — determina y CONGELA el precio de un
 * envío en shipment_rate_calculations + shipment_charge_items (§7).
 *
 * - La zona sale de: zona ya asignada al envío → localidad configurada.
 * - La tarifa histórica se elige por la fecha de venta del envío (§5).
 * - La regla de cobro por estado sale de billing_rules (org > global) (§8).
 * - Un cálculo con status "overridden" (corrección manual) NUNCA se pisa.
 */

export interface CalculationResult {
  calculationId: string;
  status: string;
  total: number;
  billable: boolean;
}

export async function ensureShipmentCalculation(
  shipmentId: string,
  opts: { force?: boolean } = {}
): Promise<CalculationResult | null> {
  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select(
      `id, organization_id, client_id, connection_id, internal_status, attempt_count,
       package_count, sold_at, created_at, zone_id,
       shipment_addresses(city),
       clients!inner(retry_billing_mode)`
    )
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) return null;

  const { data: existing } = await admin
    .from("shipment_rate_calculations")
    .select("id, status, total, billable")
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  // El precio congelado por corrección manual no se recalcula jamás
  if (existing?.status === "overridden") {
    return {
      calculationId: existing.id,
      status: existing.status,
      total: Number(existing.total),
      billable: existing.billable,
    };
  }
  if (existing && !opts.force) {
    return {
      calculationId: existing.id,
      status: existing.status,
      total: Number(existing.total),
      billable: existing.billable,
    };
  }

  const rawCity =
    (shipment.shipment_addresses as unknown as { city: string | null } | null)?.city ?? null;
  const normalizedCity = rawCity ? normalizeLocationName(rawCity) : null;

  // 1. Zona: la del envío, o la de la localidad configurada
  let zoneId: string | null = shipment.zone_id;
  let locationId: string | null = null;
  const locationMatch = await resolveLocationByCity(shipment.organization_id, rawCity);
  if (locationMatch) {
    locationId = locationMatch.locationId;
    if (!zoneId && locationMatch.zoneId) {
      zoneId = locationMatch.zoneId;
      // Propagar la zona al envío para el resto de la operación
      await admin
        .from("shipments")
        .update({ zone_id: zoneId, zone_method: "location", zone_confidence: "high" })
        .eq("id", shipment.id)
        .is("zone_id", null);
    }
  }

  const soldDate = (shipment.sold_at ?? shipment.created_at).slice(0, 10);
  const retryMode = (shipment.clients as unknown as { retry_billing_mode: RetryBillingMode })
    .retry_billing_mode;

  // 2. Tarifa histórica: personalizada del cliente > general de zona (§6)
  let rate: RateWindow | null = null;
  let rateSource: import("./engine").RateSource | null = null;
  if (zoneId) {
    const [{ data: clientRates }, { data: zoneRates }] = await Promise.all([
      admin
        .from("client_zone_rates")
        .select("*")
        .eq("organization_id", shipment.organization_id)
        .eq("client_id", shipment.client_id)
        .eq("zone_id", zoneId),
      admin
        .from("zone_rates")
        .select("*")
        .eq("organization_id", shipment.organization_id)
        .eq("zone_id", zoneId),
    ]);
    const resolved = resolveRate(
      normalizeRates(clientRates ?? []),
      normalizeRates(zoneRates ?? []),
      soldDate
    );
    if (resolved) {
      rate = resolved.rate;
      rateSource = resolved.source;
    }
  }

  // 3. Regla de cobro: específica de la organización > default global (§8)
  const { data: rules } = await admin
    .from("billing_rules")
    .select("organization_id, charge, fixed_amount, percent")
    .eq("applies_to", "status")
    .eq("rule_key", shipment.internal_status)
    .eq("active", true)
    .or(`organization_id.is.null,organization_id.eq.${shipment.organization_id}`);

  const orgRule = rules?.find((r) => r.organization_id !== null);
  const globalRule = rules?.find((r) => r.organization_id === null);
  const ruleRow = orgRule ?? globalRule ?? null;
  const rule: BillingRule | null = ruleRow
    ? {
        charge: ruleRow.charge,
        fixed_amount: ruleRow.fixed_amount !== null ? Number(ruleRow.fixed_amount) : null,
        percent: ruleRow.percent !== null ? Number(ruleRow.percent) : null,
      }
    : null;

  // 4. Cálculo puro
  const charge = computeShipmentCharge({
    internalStatus: shipment.internal_status,
    attemptCount: shipment.attempt_count,
    packageCount: shipment.package_count,
    retryMode,
    rule,
    rate,
  });

  const status = !zoneId
    ? "no_zone"
    : charge.status === "calculated" && charge.requiresReview
      ? "review"
      : charge.status;

  const calcValues = {
    organization_id: shipment.organization_id,
    client_id: shipment.client_id,
    connection_id: shipment.connection_id,
    shipment_id: shipment.id,
    original_city: rawCity,
    normalized_city: normalizedCity,
    location_id: locationId,
    zone_id: zoneId,
    rate_id: rate?.id ?? null,
    rate_source: rateSource,
    base_price: charge.basePrice,
    additions_total: charge.additionsTotal,
    discounts_total: 0,
    total: charge.total,
    currency: charge.currency,
    billable: charge.billable && !!zoneId,
    billing_rule: {
      rule,
      rate_source: rateSource,
      retry_mode: retryMode,
      attempt_count: shipment.attempt_count,
      sold_date: soldDate,
      explanation: charge.explanation,
    },
    status,
    requires_review: charge.requiresReview || !zoneId,
    calculated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await admin
    .from("shipment_rate_calculations")
    .upsert(calcValues, { onConflict: "shipment_id" })
    .select("id")
    .single();
  if (error || !saved) throw new Error(`No se pudo guardar el cálculo: ${error?.message}`);

  await admin.from("shipment_charge_items").delete().eq("calculation_id", saved.id);
  if (charge.items.length > 0) {
    await admin.from("shipment_charge_items").insert(
      charge.items.map((it) => ({
        calculation_id: saved.id,
        concept: it.concept,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        currency: charge.currency,
        billable: it.billable,
      }))
    );
  }

  return {
    calculationId: saved.id,
    status,
    total: charge.total,
    billable: charge.billable && !!zoneId,
  };
}

function normalizeRates(rows: Array<Record<string, unknown>>): RateWindow[] {
  return rows.map((r) => ({
    id: r.id as string,
    price: Number(r.price),
    currency: r.currency as string,
    retry_price: r.retry_price !== null ? Number(r.retry_price) : null,
    return_price: r.return_price !== null ? Number(r.return_price) : null,
    reschedule_price: r.reschedule_price !== null ? Number(r.reschedule_price) : null,
    additional_package_price:
      r.additional_package_price !== null ? Number(r.additional_package_price) : null,
    valid_from: r.valid_from as string,
    valid_to: (r.valid_to as string | null) ?? null,
    status: r.status as string,
  }));
}
