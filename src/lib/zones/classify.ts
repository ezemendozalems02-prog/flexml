import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Clasificación automática de zona para un envío.
 * Orden de coincidencia: código postal → localidad → barrio → partido →
 * provincia. (El match por polígono queda preparado en zone_rules pero se
 * implementa en fase 2 junto con el mapa.) Ante múltiples zonas gana la de
 * menor `priority`. Sin coincidencia → zona null ("Sin zona").
 */

export interface ZoneMatch {
  zoneId: string;
  method: "location" | "zip" | "city" | "neighborhood" | "district" | "province";
  confidence: "high" | "medium" | "low";
}

const RULE_ORDER: Array<{
  ruleType: Exclude<ZoneMatch["method"], "location">;
  confidence: ZoneMatch["confidence"];
}> = [
  { ruleType: "zip", confidence: "high" },
  { ruleType: "city", confidence: "high" },
  { ruleType: "neighborhood", confidence: "medium" },
  { ruleType: "district", confidence: "medium" },
  { ruleType: "province", confidence: "low" },
];

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export async function classifyZone(
  organizationId: string,
  address: {
    zip?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    district?: string | null;
    province?: string | null;
  }
): Promise<ZoneMatch | null> {
  const admin = createAdminClient();

  // 0. Localidad configurada (módulo de tarifas): es la regla más fuerte
  const { resolveLocationByCity } = await import("@/lib/billing/location-service");
  const locationMatch = await resolveLocationByCity(organizationId, address.city);
  if (locationMatch?.zoneId) {
    return { zoneId: locationMatch.zoneId, method: "location", confidence: "high" };
  }

  const { data: rules } = await admin
    .from("zone_rules")
    .select("zone_id, rule_type, value, zones!inner(id, organization_id, priority, status)")
    .eq("zones.organization_id", organizationId)
    .eq("zones.status", "active");

  if (!rules || rules.length === 0) return null;

  const fields: Record<Exclude<ZoneMatch["method"], "location">, string | null> = {
    zip: normalize(address.zip),
    city: normalize(address.city),
    neighborhood: normalize(address.neighborhood),
    district: normalize(address.district),
    province: normalize(address.province),
  };

  for (const { ruleType, confidence } of RULE_ORDER) {
    const target = fields[ruleType];
    if (!target) continue;

    const matches = rules
      .filter((r) => r.rule_type === ruleType && normalize(r.value) === target)
      .map((r) => ({
        zoneId: r.zone_id,
        priority: (r.zones as unknown as { priority: number }).priority,
      }))
      .sort((a, b) => a.priority - b.priority);

    if (matches.length > 0) {
      return { zoneId: matches[0].zoneId, method: ruleType, confidence };
    }
  }
  return null;
}
