"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error?: string;
}

const credentialsSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Correo o contraseña incorrectos" };

  redirect("/");
}

const registerSchema = credentialsSchema.extend({
  fullName: z.string().min(2, "Ingresá tu nombre completo"),
});

export async function signUp(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error) return { error: error.message };

  // Crear perfil extendido (service role: el usuario recién creado puede no
  // tener sesión activa aún si la verificación de correo está habilitada)
  if (data.user) {
    const admin = createAdminClient();
    await admin.from("platform_users").upsert({
      id: data.user.id,
      full_name: parsed.data.fullName,
    });
  }

  if (data.session) redirect("/onboarding");
  redirect("/login?registered=1");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const organizationSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre comercial"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  phone: z.string().optional(),
});

export async function createOrganization(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName") || undefined,
    taxId: formData.get("taxId") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión vencida, ingresá de nuevo" };

  const admin = createAdminClient();

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: parsed.data.name,
      legal_name: parsed.data.legalName ?? null,
      tax_id: parsed.data.taxId ?? null,
      phone: parsed.data.phone ?? null,
      email: user.email,
      onboarding_step: 1,
    })
    .select("id")
    .single();
  if (orgErr || !org) return { error: `No se pudo crear la empresa: ${orgErr?.message}` };

  await admin.from("platform_users").upsert({ id: user.id }, { ignoreDuplicates: true });

  const { error: memberErr } = await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "owner",
    status: "active",
    joined_at: new Date().toISOString(),
  });
  if (memberErr) return { error: `No se pudo crear la membresía: ${memberErr.message}` };

  await admin.from("organization_settings").insert({ organization_id: org.id });

  await admin.from("audit_logs").insert({
    organization_id: org.id,
    user_id: user.id,
    action: "organization.created",
    resource_type: "organization",
    resource_id: org.id,
    new_data: { name: parsed.data.name },
  });

  redirect("/dashboard");
}
