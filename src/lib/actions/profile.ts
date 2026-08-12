"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface ProfileActionResult {
  error?: string;
  ok?: boolean;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresá tu nombre completo").max(120),
});

/**
 * Actualiza el nombre para mostrar del usuario logueado (platform_users.full_name).
 * Es el mismo campo que se muestra en los encabezados del panel/PWA — cada
 * usuario solo puede editar el suyo (RLS: users_self_update, id = auth.uid()).
 */
export async function updateMyProfileAction(
  _prev: ProfileActionResult,
  formData: FormData
): Promise<ProfileActionResult> {
  const session = await requireSession();
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_users")
    .update({ full_name: parsed.data.fullName })
    .eq("id", session.userId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/driver/profile");
  revalidatePath("/dashboard");
  revalidatePath("/driver");
  revalidatePath("/seller");
  return { ok: true };
}
