"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";

const driverSchema = z.object({
  firstName: z.string().min(2, "Ingresá el nombre"),
  lastName: z.string().min(2, "Ingresá el apellido"),
  phone: z.string().optional(),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  nationalId: z.string().optional(),
  vehicleType: z.string().optional(),
});

export async function createDriverAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);

  const parsed = driverSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    nationalId: formData.get("nationalId") || undefined,
    vehicleType: formData.get("vehicleType") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").insert({
    organization_id: session.organization.id,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email || null,
    national_id: parsed.data.nationalId ?? null,
  });
  if (error) return { error: `No se pudo crear el repartidor: ${error.message}` };

  revalidatePath("/drivers");
  return {};
}
