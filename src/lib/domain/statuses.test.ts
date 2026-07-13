import { describe, expect, it } from "vitest";
import {
  INTERNAL_STATUSES,
  INTERNAL_STATUS_META,
  internalStatusLabel,
  internalStatusBadgeClass,
} from "./statuses";

describe("estados internos", () => {
  it("todos los estados tienen metadatos", () => {
    for (const status of INTERNAL_STATUSES) {
      expect(INTERNAL_STATUS_META[status]).toBeDefined();
      expect(INTERNAL_STATUS_META[status].label.length).toBeGreaterThan(0);
    }
  });

  it("devuelve etiqueta en español", () => {
    expect(internalStatusLabel("delivered")).toBe("Entregado");
    expect(internalStatusLabel("rescheduled")).toBe("Reprogramado");
  });

  it("un estado desconocido no rompe la UI", () => {
    expect(internalStatusLabel("algo_raro")).toBe("algo_raro");
    expect(internalStatusBadgeClass("algo_raro")).toContain("bg-");
  });
});
