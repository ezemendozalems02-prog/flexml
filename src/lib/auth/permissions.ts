import type { MemberRole } from "@/lib/domain/types";

/**
 * RolePermissionService (parte pura) — permisos por acción y recurso (§15).
 * La UI oculta lo no permitido, pero la validación REAL es esta, ejecutada en
 * el backend (server actions y route handlers) + RLS en la base.
 */

export const PERMISSIONS = [
  // Envíos
  "shipments.view_all",
  "shipments.view_own_client",
  "shipments.view_assigned",
  "shipments.update_status",
  "shipments.reprogram",
  "shipments.cancel",
  "shipments.export",
  // Etiquetas
  "labels.view",
  "labels.download",
  "labels.print",
  "labels.refresh",
  "labels.report_issue",
  "labels.view_history",
  "labels.manage",
  // Finanzas
  "rates.view",
  "rates.create",
  "rates.update",
  "settlements.view",
  "settlements.create",
  "settlements.confirm",
  "settlements.export",
  "billing.view_totals",
  // Configuración
  "clients.manage",
  "connections.manage",
  "zones.manage",
  "users.manage",
  "roles.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Matriz inicial de permisos por rol (§16).
 * - owner/admin: todo (el admin es "Dani": ve tarifas, totales, liquidaciones).
 * - operator: operación completa SIN finanzas.
 * - client (rol vendedor / SELLER_OPERATOR): autoservicio de su comercio,
 *   nunca precios ni datos de otros clientes.
 * - driver: solo sus envíos asignados, nunca precios.
 */
const ROLE_MATRIX: Record<MemberRole, Permission[]> = {
  owner: ALL,
  admin: ALL,
  operator: [
    "shipments.view_all",
    "shipments.update_status",
    "shipments.reprogram",
    "shipments.export",
    "labels.view",
    "labels.download",
    "labels.print",
    "labels.refresh",
    "labels.report_issue",
    "labels.view_history",
    "labels.manage",
    "clients.manage",
    "zones.manage",
  ],
  client: [
    "shipments.view_own_client",
    "labels.view",
    "labels.download",
    "labels.print",
    "labels.refresh",
    "labels.report_issue",
  ],
  driver: [
    "shipments.view_assigned",
    "shipments.update_status",
    "shipments.reprogram",
    "labels.view",
    "labels.download",
    "labels.print",
    "labels.report_issue",
  ],
};

export interface PermissionOverride {
  permission_key: string;
  granted: boolean;
}

/** Permisos efectivos: matriz del rol + overrides individuales (§15). */
export function effectivePermissions(
  role: MemberRole,
  overrides: PermissionOverride[] = []
): Set<Permission> {
  const set = new Set<Permission>(ROLE_MATRIX[role] ?? []);
  for (const o of overrides) {
    const key = o.permission_key as Permission;
    if (!ALL.includes(key)) continue;
    if (o.granted) set.add(key);
    else set.delete(key);
  }
  return set;
}

export function roleHasPermission(
  role: MemberRole,
  permission: Permission,
  overrides: PermissionOverride[] = []
): boolean {
  return effectivePermissions(role, overrides).has(permission);
}

/** Roles que ven información financiera. Vendedor y repartidor NUNCA. */
export function canViewFinancials(role: MemberRole): boolean {
  return roleHasPermission(role, "rates.view");
}
