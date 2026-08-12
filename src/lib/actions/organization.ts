"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface OrgActionResult {
  error?: string;
  ok?: boolean;
}

const orgSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre comercial").max(120),
  legalName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Corrige los datos básicos de la empresa (organizations.name/legal_name/
 * phone). Solo el owner puede tocarlos — misma regla que ya exigía la RLS
 * (org_update: has_org_role(id, ['owner'])), acá solo se le suma UI.
 */
export async function updateOrganizationAction(
  _prev: OrgActionResult,
  formData: FormData
): Promise<OrgActionResult> {
  const session = await requireRole(["owner"]);
  const parsed = orgSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName ?? null,
      phone: parsed.data.phone ?? null,
    })
    .eq("id", session.organization.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/shipments");
  revalidatePath("/driver");
  revalidatePath("/seller");
  return { ok: true };
}
