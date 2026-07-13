"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";

const zoneSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre de la zona"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
  zips: z.string().optional(),
  cities: z.string().optional(),
});

export async function createZoneAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);

  const parsed = zoneSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#64748b",
    zips: formData.get("zips") || undefined,
    cities: formData.get("cities") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: zone, error } = await supabase
    .from("zones")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      color: parsed.data.color,
    })
    .select("id")
    .single();
  if (error || !zone) return { error: `No se pudo crear la zona: ${error?.message}` };

  const rules: Array<{ zone_id: string; rule_type: string; value: string }> = [];
  for (const zip of (parsed.data.zips ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    rules.push({ zone_id: zone.id, rule_type: "zip", value: zip });
  }
  for (const city of (parsed.data.cities ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    rules.push({ zone_id: zone.id, rule_type: "city", value: city });
  }
  if (rules.length > 0) {
    const { error: rulesError } = await supabase.from("zone_rules").insert(rules);
    if (rulesError) return { error: `Zona creada pero fallaron las reglas: ${rulesError.message}` };
  }

  revalidatePath("/zones");
  return {};
}
