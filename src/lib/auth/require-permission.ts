import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession, type SessionContext } from "./session";
import {
  roleHasPermission,
  type Permission,
  type PermissionOverride,
} from "./permissions";

/**
 * Guard de backend: valida sesión + permiso efectivo (rol + overrides de
 * user_permissions). La UI puede ocultar botones, pero ESTA es la validación
 * que cuenta. Usar en server actions y route handlers.
 */

async function loadOverrides(session: SessionContext): Promise<PermissionOverride[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_permissions")
    .select("permission_key, granted")
    .eq("organization_id", session.organization.id)
    .eq("user_id", session.userId);
  return (data ?? []) as PermissionOverride[];
}

export async function hasPermission(
  session: SessionContext,
  permission: Permission
): Promise<boolean> {
  const overrides = await loadOverrides(session);
  return roleHasPermission(session.membership.role, permission, overrides);
}

/** Redirige al inicio del rol si no tiene el permiso. */
export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const session = await requireSession();
  if (!(await hasPermission(session, permission))) {
    redirect(homeForRole(session.membership.role));
  }
  return session;
}

/** Variante para APIs: devuelve null en lugar de redirigir. */
export async function checkPermission(
  permission: Permission
): Promise<SessionContext | null> {
  const session = await requireSession();
  return (await hasPermission(session, permission)) ? session : null;
}

export function homeForRole(role: SessionContext["membership"]["role"]): string {
  if (role === "driver") return "/driver";
  if (role === "client") return "/seller";
  return "/dashboard";
}

/**
 * Alcance de un envío para el usuario actual (§16): admin/operador todos,
 * vendedor los de su cliente, repartidor los asignados.
 */
export function shipmentInScope(
  session: SessionContext,
  shipment: { client_id: string | null; driver_id: string | null }
): boolean {
  const { role, client_id, driver_id } = session.membership;
  if (["owner", "admin", "operator"].includes(role)) return true;
  if (role === "client") return !!client_id && shipment.client_id === client_id;
  if (role === "driver") return !!driver_id && shipment.driver_id === driver_id;
  return false;
}
