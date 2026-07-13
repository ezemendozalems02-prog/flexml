/**
 * Motor de precios — funciones PURAS, sin acceso a base de datos.
 *
 * Flujo: Localidad → Zona → Tarifa (histórica) → Regla cobrable →
 *        Adicionales (reintentos/devolución/reprogramación) → Total del envío.
 *
 * La orquestación con Supabase vive en shipment-billing.ts; acá solo cálculo,
 * para que cada regla sea testeable de forma aislada.
 */

// ---------------------------------------------------------------------------
// Tarifas con vigencia
// ---------------------------------------------------------------------------

export interface RateWindow {
  id: string;
  price: number;
  currency: string;
  retry_price: number | null;
  return_price: number | null;
  reschedule_price: number | null;
  additional_package_price: number | null;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null;
  status: string;
}

/**
 * Elige la tarifa vigente a una fecha dada. Nunca usa tarifas futuras ni
 * vencidas: un envío del 28/07 se calcula con la tarifa vigente ese día
 * aunque hoy exista una más nueva. Ante ventanas superpuestas gana la de
 * `valid_from` más reciente (y se reporta la superposición aparte).
 */
export function pickApplicableRate<T extends RateWindow>(rates: T[], date: string): T | null {
  const day = date.slice(0, 10);
  const applicable = rates
    .filter((r) => r.status === "active")
    .filter((r) => r.valid_from <= day && (r.valid_to === null || r.valid_to >= day))
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
  return applicable[0] ?? null;
}

/** Detecta ventanas de vigencia superpuestas (validación §19). */
export function findOverlappingRates<T extends RateWindow>(rates: T[]): Array<[T, T]> {
  const active = rates.filter((r) => r.status === "active");
  const overlaps: Array<[T, T]> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const aEnd = a.valid_to ?? "9999-12-31";
      const bEnd = b.valid_to ?? "9999-12-31";
      if (a.valid_from <= bEnd && b.valid_from <= aEnd) overlaps.push([a, b]);
    }
  }
  return overlaps;
}

export type RateSource = "shipment_override" | "client_rate" | "zone_rate";

/**
 * Prioridad de tarifas (§6):
 * 1. Tarifa personalizada del cliente (client_zone_rates).
 * 2. Tarifa general de la zona (zone_rates).
 * (La tarifa especial del envío se maneja como override manual del cálculo.)
 */
export function resolveRate<T extends RateWindow>(
  clientRates: T[],
  zoneRates: T[],
  date: string
): { rate: T; source: RateSource } | null {
  const client = pickApplicableRate(clientRates, date);
  if (client) return { rate: client, source: "client_rate" };
  const zone = pickApplicableRate(zoneRates, date);
  if (zone) return { rate: zone, source: "zone_rate" };
  return null;
}

// ---------------------------------------------------------------------------
// Reglas de cobro
// ---------------------------------------------------------------------------

export type ChargeMode = "full" | "fixed" | "percent" | "none" | "review";

export interface BillingRule {
  charge: ChargeMode;
  fixed_amount: number | null;
  percent: number | null;
}

export type RetryBillingMode = "final_only" | "plus_retry" | "per_visit";

export interface ChargeItem {
  concept: "delivery" | "retry" | "return" | "reschedule" | "additional_package";
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  billable: boolean;
}

export interface ChargeComputation {
  billable: boolean;
  requiresReview: boolean;
  status: "calculated" | "not_billable" | "review" | "no_rate";
  basePrice: number;
  additionsTotal: number;
  total: number;
  currency: string;
  items: ChargeItem[];
  /** desglose auditable de la decisión */
  explanation: string[];
}

export interface ShipmentBillingInput {
  internalStatus: string;
  attemptCount: number;
  packageCount: number;
  retryMode: RetryBillingMode;
  rule: BillingRule | null;
  rate: RateWindow | null;
}

const RETURN_STATUSES = new Set(["returned", "pending_return", "returned_to_seller"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ShipmentBillingService (parte pura): calcula el cargo de UN envío.
 * El resultado se congela en shipment_rate_calculations (§7): cambios
 * posteriores de tarifa no alteran envíos ya calculados.
 */
export function computeShipmentCharge(input: ShipmentBillingInput): ChargeComputation {
  const explanation: string[] = [];
  const currency = input.rate?.currency ?? "ARS";

  if (!input.rule) {
    explanation.push(`Sin regla de cobro para el estado "${input.internalStatus}": requiere revisión`);
    return emptyResult("review", currency, explanation, true);
  }

  if (input.rule.charge === "none") {
    explanation.push(`Estado "${input.internalStatus}" configurado como no cobrable`);
    return emptyResult("not_billable", currency, explanation, false);
  }

  if (input.rule.charge === "review") {
    explanation.push(`Estado "${input.internalStatus}" requiere decisión manual (regla "review")`);
    return emptyResult("review", currency, explanation, true);
  }

  if (!input.rate) {
    explanation.push("Envío cobrable pero sin tarifa aplicable: marcar Sin precio");
    return emptyResult("no_rate", currency, explanation, true);
  }

  // Precio base según el modo de la regla
  let basePrice: number;
  switch (input.rule.charge) {
    case "full":
      basePrice = input.rate.price;
      explanation.push(`Precio base de zona: ${input.rate.price}`);
      break;
    case "fixed":
      basePrice = input.rule.fixed_amount ?? 0;
      explanation.push(`Importe fijo por regla: ${basePrice}`);
      break;
    case "percent": {
      const pct = input.rule.percent ?? 0;
      basePrice = round2((input.rate.price * pct) / 100);
      explanation.push(`${pct}% del precio de zona (${input.rate.price}) = ${basePrice}`);
      break;
    }
  }

  const items: ChargeItem[] = [
    {
      concept: "delivery",
      description: `Envío (${input.internalStatus})`,
      quantity: 1,
      unit_price: basePrice,
      amount: basePrice,
      billable: true,
    },
  ];

  let requiresReview = false;

  // Reintentos según modalidad del cliente (§9)
  const extraVisits = Math.max(0, input.attemptCount - 1);
  let billableRetries = 0;
  switch (input.retryMode) {
    case "final_only":
      billableRetries = 0;
      if (extraVisits > 0) explanation.push(`Modalidad "solo entrega final": ${extraVisits} reintento(s) sin cargo`);
      break;
    case "plus_retry":
      billableRetries = Math.min(extraVisits, 1);
      break;
    case "per_visit":
      billableRetries = extraVisits;
      break;
  }
  if (billableRetries > 0) {
    const retryPrice = input.rate.retry_price;
    if (retryPrice === null) {
      explanation.push(`${billableRetries} reintento(s) cobrables pero la tarifa no define precio de reintento: revisar`);
      requiresReview = true;
    } else {
      items.push({
        concept: "retry",
        description: `Reintento (modalidad ${input.retryMode})`,
        quantity: billableRetries,
        unit_price: retryPrice,
        amount: round2(billableRetries * retryPrice),
        billable: true,
      });
      explanation.push(`Reintentos: ${billableRetries} × ${retryPrice}`);
    }
  }

  // Devolución (§11): movimiento adicional cuando el estado es de devolución
  if (RETURN_STATUSES.has(input.internalStatus)) {
    const returnPrice = input.rate.return_price;
    if (returnPrice === null) {
      explanation.push("Devolución cobrable pero la tarifa no define precio de devolución: revisar");
      requiresReview = true;
    } else {
      items.push({
        concept: "return",
        description: "Devolución al comercio",
        quantity: 1,
        unit_price: returnPrice,
        amount: returnPrice,
        billable: true,
      });
      explanation.push(`Devolución: ${returnPrice}`);
    }
  }

  // Paquetes adicionales (§4)
  const extraPackages = Math.max(0, input.packageCount - 1);
  if (extraPackages > 0 && input.rate.additional_package_price !== null) {
    items.push({
      concept: "additional_package",
      description: "Paquete adicional",
      quantity: extraPackages,
      unit_price: input.rate.additional_package_price,
      amount: round2(extraPackages * input.rate.additional_package_price),
      billable: true,
    });
    explanation.push(`Paquetes adicionales: ${extraPackages} × ${input.rate.additional_package_price}`);
  }

  const additionsTotal = round2(
    items.filter((i) => i.concept !== "delivery").reduce((acc, i) => acc + i.amount, 0)
  );
  const total = round2(basePrice + additionsTotal);

  return {
    billable: true,
    requiresReview,
    status: "calculated",
    basePrice,
    additionsTotal,
    total,
    currency,
    items,
    explanation,
  };
}

function emptyResult(
  status: "not_billable" | "review" | "no_rate",
  currency: string,
  explanation: string[],
  requiresReview: boolean
): ChargeComputation {
  return {
    billable: false,
    requiresReview,
    status,
    basePrice: 0,
    additionsTotal: 0,
    total: 0,
    currency,
    items: [],
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function formatMoney(amount: number, currency = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}
