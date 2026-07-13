import { describe, expect, it } from "vitest";
import { locationNamesMatch, normalizeLocationName } from "./normalization";

describe("normalizeLocationName (§3)", () => {
  it("unifica variantes de abreviatura y ruido ('Gral.', 'Partido de')", () => {
    // Estas variantes colapsan por normalización pura:
    expect(normalizeLocationName("Gral. San Martín")).toBe("general san martin");
    expect(normalizeLocationName("Gral San Martin")).toBe("general san martin");
    expect(normalizeLocationName("General San Martín")).toBe("general san martin");
    expect(normalizeLocationName("Partido de San Martín")).toBe("san martin");
    expect(normalizeLocationName("San Martin")).toBe("san martin");
    // "San Martín" ↔ "General San Martín" difieren en contenido real:
    // esa equivalencia se configura como ALIAS de la localidad principal (§3).
  });

  it("quita tildes, puntuación y mayúsculas", () => {
    expect(normalizeLocationName("MORÓN")).toBe("moron");
    expect(normalizeLocationName("V. López")).toBe("v lopez");
  });

  it("locationNamesMatch compara tolerando variantes", () => {
    expect(locationNamesMatch("Morón", "moron")).toBe(true);
    expect(locationNamesMatch("Quilmes", "Pilar")).toBe(false);
  });
});
