import { describe, expect, it } from "vitest";
import {
  computeShipmentCharge,
  findOverlappingRates,
  pickApplicableRate,
  resolveRate,
  type RateWindow,
} from "./engine";

function rate(overrides: Partial<RateWindow> = {}): RateWindow {
  return {
    id: "r1",
    price: 5000,
    currency: "ARS",
    retry_price: 3000,
    return_price: 4000,
    reschedule_price: null,
    additional_package_price: 1000,
    valid_from: "2026-01-01",
    valid_to: null,
    status: "active",
    ...overrides,
  };
}

describe("pickApplicableRate — historial de tarifas (§5)", () => {
  const oldRate = rate({ id: "old", price: 5000, valid_from: "2026-01-01", valid_to: "2026-07-31" });
  const newRate = rate({ id: "new", price: 5500, valid_from: "2026-08-01" });

  it("un envío del 28/07 usa la tarifa anterior", () => {
    expect(pickApplicableRate([oldRate, newRate], "2026-07-28")?.id).toBe("old");
  });

  it("un envío del 03/08 usa la tarifa nueva", () => {
    expect(pickApplicableRate([oldRate, newRate], "2026-08-03")?.id).toBe("new");
  });

  it("no usa tarifas futuras", () => {
    expect(pickApplicableRate([newRate], "2026-07-01")).toBeNull();
  });

  it("ignora tarifas inactivas", () => {
    expect(pickApplicableRate([rate({ status: "inactive" })], "2026-06-01")).toBeNull();
  });
});

describe("resolveRate — prioridad (§6)", () => {
  it("la tarifa personalizada del cliente gana sobre la general", () => {
    const clientRate = rate({ id: "cliente", price: 4800 });
    const zoneRate = rate({ id: "general", price: 5000 });
    const result = resolveRate([clientRate], [zoneRate], "2026-06-01");
    expect(result?.rate.id).toBe("cliente");
    expect(result?.source).toBe("client_rate");
  });

  it("sin tarifa personalizada usa la general", () => {
    const result = resolveRate([], [rate({ id: "general" })], "2026-06-01");
    expect(result?.source).toBe("zone_rate");
  });

  it("sin ninguna tarifa devuelve null (envío Sin precio)", () => {
    expect(resolveRate([], [], "2026-06-01")).toBeNull();
  });
});

describe("findOverlappingRates — validación (§19)", () => {
  it("detecta vigencias superpuestas", () => {
    const a = rate({ id: "a", valid_from: "2026-01-01", valid_to: "2026-06-30" });
    const b = rate({ id: "b", valid_from: "2026-06-01", valid_to: null });
    expect(findOverlappingRates([a, b])).toHaveLength(1);
  });

  it("no reporta ventanas contiguas sin superposición", () => {
    const a = rate({ id: "a", valid_from: "2026-01-01", valid_to: "2026-05-31" });
    const b = rate({ id: "b", valid_from: "2026-06-01", valid_to: null });
    expect(findOverlappingRates([a, b])).toHaveLength(0);
  });
});

describe("computeShipmentCharge — reglas de cobro (§8)", () => {
  const fullRule = { charge: "full" as const, fixed_amount: null, percent: null };

  it("entregado se cobra al precio de zona", () => {
    const result = computeShipmentCharge({
      internalStatus: "delivered",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: fullRule,
      rate: rate(),
    });
    expect(result.billable).toBe(true);
    expect(result.total).toBe(5000);
    expect(result.items).toHaveLength(1);
  });

  it("estado no cobrable da total 0", () => {
    const result = computeShipmentCharge({
      internalStatus: "cancelled_by_ml",
      attemptCount: 0,
      packageCount: 1,
      retryMode: "final_only",
      rule: { charge: "none", fixed_amount: null, percent: null },
      rate: rate(),
    });
    expect(result.billable).toBe(false);
    expect(result.status).toBe("not_billable");
    expect(result.total).toBe(0);
  });

  it("regla review marca revisión sin cobrar", () => {
    const result = computeShipmentCharge({
      internalStatus: "absent",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: { charge: "review", fixed_amount: null, percent: null },
      rate: rate(),
    });
    expect(result.status).toBe("review");
    expect(result.requiresReview).toBe(true);
  });

  it("importe fijo reemplaza el precio de zona", () => {
    const result = computeShipmentCharge({
      internalStatus: "wrong_address",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: { charge: "fixed", fixed_amount: 2500, percent: null },
      rate: rate(),
    });
    expect(result.total).toBe(2500);
  });

  it("porcentaje calcula sobre el precio de zona", () => {
    const result = computeShipmentCharge({
      internalStatus: "rejected",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: { charge: "percent", fixed_amount: null, percent: 50 },
      rate: rate(),
    });
    expect(result.total).toBe(2500);
  });

  it("cobrable sin tarifa queda como Sin precio", () => {
    const result = computeShipmentCharge({
      internalStatus: "delivered",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: fullRule,
      rate: null,
    });
    expect(result.status).toBe("no_rate");
    expect(result.billable).toBe(false);
  });
});

describe("computeShipmentCharge — reintentos (§9)", () => {
  const fullRule = { charge: "full" as const, fixed_amount: null, percent: null };
  const base = {
    internalStatus: "delivered",
    packageCount: 1,
    rule: fullRule,
    rate: rate(),
  };

  it("modalidad A (solo entrega final): 3 visitas cobran 1 entrega", () => {
    const result = computeShipmentCharge({ ...base, attemptCount: 3, retryMode: "final_only" });
    expect(result.total).toBe(5000);
  });

  it("modalidad B (entrega + 1 reintento): 3 visitas cobran entrega + 1 reintento", () => {
    const result = computeShipmentCharge({ ...base, attemptCount: 3, retryMode: "plus_retry" });
    expect(result.total).toBe(8000); // 5000 + 3000
  });

  it("modalidad C (por visita): ejemplo del spec — entrega 6500 + reintento 3000 = 9500", () => {
    const result = computeShipmentCharge({
      ...base,
      attemptCount: 2,
      retryMode: "per_visit",
      rate: rate({ price: 6500, retry_price: 3000 }),
    });
    expect(result.total).toBe(9500);
  });

  it("reintento cobrable sin precio de reintento configurado pide revisión", () => {
    const result = computeShipmentCharge({
      ...base,
      attemptCount: 2,
      retryMode: "per_visit",
      rate: rate({ retry_price: null }),
    });
    expect(result.requiresReview).toBe(true);
  });
});

describe("computeShipmentCharge — devoluciones y adicionales (§11)", () => {
  it("devolución cobra base + precio de devolución", () => {
    const result = computeShipmentCharge({
      internalStatus: "returned_to_seller",
      attemptCount: 1,
      packageCount: 1,
      retryMode: "final_only",
      rule: { charge: "full", fixed_amount: null, percent: null },
      rate: rate({ price: 5000, return_price: 4000 }),
    });
    expect(result.total).toBe(9000);
    expect(result.items.map((i) => i.concept)).toContain("return");
  });

  it("paquetes adicionales suman su precio", () => {
    const result = computeShipmentCharge({
      internalStatus: "delivered",
      attemptCount: 1,
      packageCount: 3,
      retryMode: "final_only",
      rule: { charge: "full", fixed_amount: null, percent: null },
      rate: rate({ additional_package_price: 1000 }),
    });
    expect(result.total).toBe(7000); // 5000 + 2×1000
  });
});
