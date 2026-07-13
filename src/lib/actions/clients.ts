"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";

const clientSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre del comercio"),
  contactName: z.string().optional(),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  pickupAddress: z.string().optional(),
  pickupCity: z.string().optional(),
  pickupZip: z.string().optional(),
  notes: z.string().optional(),
});

export async function createClientAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    pickupAddress: formData.get("pickupAddress") || undefined,
    pickupCity: formData.get("pickupCity") || undefined,
    pickupZip: formData.get("pickupZip") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({
    organization_id: session.organization.id,
    name: parsed.data.name,
    contact_name: parsed.data.contactName ?? null,
    email: parsed.data.email || null,
    phone: parsed.data.phone ?? null,
    pickup_address: parsed.data.pickupAddress ?? null,
    pickup_city: parsed.data.pickupCity ?? null,
    pickup_zip: parsed.data.pickupZip ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (error) return { error: `No se pudo crear el cliente: ${error.message}` };

  revalidatePath("/clients");
  return {};
}
