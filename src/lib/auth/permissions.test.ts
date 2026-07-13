import { describe, expect, it } from "vitest";
import {
  effectivePermissions,
  roleHasPermission,
  canViewFinancials,
} from "./permissions";

describe("matriz de permisos (§16)", () => {
  it("el administrador ve tarifas, totales y liquidaciones", () => {
    expect(roleHasPermission("owner", "rates.view")).toBe(true);
    expect(roleHasPermission("admin", "settlements.view")).toBe(true);
    expect(roleHasPermission("admin", "billing.view_totals")).toBe(true);
    expect(roleHasPermission("admin", "labels.manage")).toBe(true);
  });

  it("el vendedor NUNCA ve información financiera", () => {
    expect(roleHasPermission("client", "rates.view")).toBe(false);
    expect(roleHasPermission("client", "settlements.view")).toBe(false);
    expect(roleHasPermission("client", "billing.view_totals")).toBe(false);
    expect(canViewFinancials("client")).toBe(false);
  });

  it("el repartidor NUNCA ve información financiera", () => {
    expect(roleHasPermission("driver", "rates.view")).toBe(false);
    expect(roleHasPermission("driver", "settlements.view")).toBe(false);
    expect(canViewFinancials("driver")).toBe(false);
  });

  it("el operador opera pero no ve finanzas", () => {
    expect(roleHasPermission("operator", "shipments.view_all")).toBe(true);
    expect(roleHasPermission("operator", "labels.manage")).toBe(true);
    expect(roleHasPermission("operator", "rates.view")).toBe(false);
    expect(roleHasPermission("operator", "settlements.create")).toBe(false);
  });

  it("el vendedor puede autogestionar etiquetas de su cliente", () => {
    expect(roleHasPermission("client", "shipments.view_own_client")).toBe(true);
    expect(roleHasPermission("client", "labels.view")).toBe(true);
    expect(roleHasPermission("client", "labels.download")).toBe(true);
    expect(roleHasPermission("client", "labels.print")).toBe(true);
    expect(roleHasPermission("client", "labels.report_issue")).toBe(true);
    expect(roleHasPermission("client", "shipments.view_all")).toBe(false);
    expect(roleHasPermission("client", "users.manage")).toBe(false);
  });

  it("el repartidor solo alcanza lo asignado y puede operar estados", () => {
    expect(roleHasPermission("driver", "shipments.view_assigned")).toBe(true);
    expect(roleHasPermission("driver", "shipments.update_status")).toBe(true);
    expect(roleHasPermission("driver", "labels.download")).toBe(true);
    expect(roleHasPermission("driver", "shipments.view_all")).toBe(false);
    expect(roleHasPermission("driver", "zones.manage")).toBe(false);
  });
});

describe("overrides por usuario (§15)", () => {
  it("un override granted=true otorga un permiso extra", () => {
    expect(
      roleHasPermission("client", "labels.refresh", [
        { permission_key: "connections.manage", granted: true },
      ])
    ).toBe(true);
    expect(
      roleHasPermission("client", "connections.manage", [
        { permission_key: "connections.manage", granted: true },
      ])
    ).toBe(true);
  });

  it("un override granted=false revoca un permiso del rol", () => {
    expect(
      roleHasPermission("client", "labels.download", [
        { permission_key: "labels.download", granted: false },
      ])
    ).toBe(false);
  });

  it("un override nunca puede otorgar un permiso inexistente", () => {
    const perms = effectivePermissions("driver", [
      { permission_key: "superpoder.inexistente", granted: true },
    ]);
    expect([...perms].every((p) => typeof p === "string")).toBe(true);
    expect(perms.has("rates.view" as never)).toBe(false);
  });
});
