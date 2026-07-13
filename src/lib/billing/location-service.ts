import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocationName } from "./normalization";

/**
 * ZoneClassificationService (por localidad) — resuelve la zona de un envío a
 * partir del nombre de localidad configurado por el administrador.
 *
 * Lookup: localidades (normalized_name) → alias (normalized_alias).
 * Si no hay coincidencia el envío queda "Localidad sin clasificar": no se
 * calcula precio y aparece en las alertas. Cuando el administrador crea la
 * localidad (o el alias) con su zona, la regla se reutiliza automáticamente
 * para los envíos futuros y los pendientes se reclasifican al recalcular.
 */

export interface LocationMatch {
  locationId: string;
  zoneId: string | null;
  matchedBy: "location" | "alias";
}

export async function resolveLocationByCity(
  organizationId: string,
  rawCity: string | null | undefined
): Promise<LocationMatch | null> {
  if (!rawCity) return null;
  const normalized = normalizeLocationName(rawCity);
  if (!normalized) return null;

  const admin = createAdminClient();

  const { data: location } = await admin
    .from("locations")
    .select("id, zone_id")
    .eq("organization_id", organizationId)
    .eq("normalized_name", normalized)
    .eq("status", "active")
    .maybeSingle();

  if (location) {
    return { locationId: location.id, zoneId: location.zone_id, matchedBy: "location" };
  }

  const { data: alias } = await admin
    .from("location_aliases")
    .select("location_id, locations!inner(id, zone_id, status)")
    .eq("organization_id", organizationId)
    .eq("normalized_alias", normalized)
    .maybeSingle();

  if (alias) {
    const loc = alias.locations as unknown as { id: string; zone_id: string | null; status: string };
    if (loc.status === "active") {
      return { locationId: loc.id, zoneId: loc.zone_id, matchedBy: "alias" };
    }
  }

  return null;
}

/**
 * Localidades presentes en envíos que todavía no matchean ninguna localidad
 * ni alias configurado ("Localidad sin clasificar", §3).
 */
export async function findUnclassifiedCities(
  organizationId: string
): Promise<Array<{ city: string; count: number }>> {
  const admin = createAdminClient();

  const { data: addresses } = await admin
    .from("shipment_addresses")
    .select("city, shipments!inner(organization_id)")
    .eq("shipments.organization_id", organizationId)
    .not("city", "is", null)
    .limit(5000);

  const counts = new Map<string, { city: string; count: number }>();
  for (const a of addresses ?? []) {
    if (!a.city) continue;
    const key = normalizeLocationName(a.city);
    if (!key) continue;
    const entry = counts.get(key) ?? { city: a.city, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  if (counts.size === 0) return [];

  const keys = [...counts.keys()];
  const [{ data: locations }, { data: aliases }] = await Promise.all([
    admin
      .from("locations")
      .select("normalized_name")
      .eq("organization_id", organizationId)
      .in("normalized_name", keys),
    admin
      .from("location_aliases")
      .select("normalized_alias")
      .eq("organization_id", organizationId)
      .in("normalized_alias", keys),
  ]);

  for (const l of locations ?? []) counts.delete(l.normalized_name);
  for (const a of aliases ?? []) counts.delete(a.normalized_alias);

  return [...counts.values()].sort((a, b) => b.count - a.count);
}
