/**
 * FlexControl — Creación de usuarios de PRUEBA
 *
 * Crea 5 usuarios (uno por rol) en Supabase Auth y los vincula a la
 * organización demo (la crea si no existe). Idempotente: se puede correr
 * varias veces sin duplicar nada.
 *
 * Uso:
 *   npm run seed:users
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL     (proyecto real, no placeholder)
 *   SUPABASE_SERVICE_ROLE_KEY    (Settings → API → service_role)
 *
 * ⚠️ Solo para entornos de desarrollo/demo. No correr en producción.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- Cargar .env.local sin dependencias externas ---
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "✖ Faltan credenciales.\n" +
      "  Completá en .env.local:\n" +
      "   - NEXT_PUBLIC_SUPABASE_URL (URL de tu proyecto Supabase)\n" +
      "   - SUPABASE_SERVICE_ROLE_KEY (Settings → API → service_role)\n"
  );
  process.exit(1);
}
if (url.includes("mock.supabase.co") || url.includes("example")) {
  console.error(
    `✖ NEXT_PUBLIC_SUPABASE_URL apunta a un placeholder (${url}).\n` +
      "  Creá un proyecto en https://supabase.com, ejecutá las migraciones de\n" +
      "  supabase/migrations/ y cargá la URL y las keys reales en .env.local."
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "FlexControl2026!";

const USERS = [
  { email: "dueno@flexcontrol.test", name: "Diana Dueña", role: "owner" },
  { email: "admin@flexcontrol.test", name: "Andrés Admin", role: "admin" },
  { email: "operador@flexcontrol.test", name: "Olga Operadora", role: "operator" },
  { email: "repartidor@flexcontrol.test", name: "Juan Pérez", role: "driver" },
  { email: "comercio@flexcontrol.test", name: "Hugo Comercio", role: "client" },
];

async function getOrCreateAuthUser(email, name) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!error) return created.user;

  // Ya existe: buscarlo por email
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`No se pudo crear ni encontrar ${email}: ${error.message}`);
  // Asegurar contraseña conocida para el entorno de prueba
  await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
  return existing;
}

async function getOrCreateDemoOrg() {
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();
  if (org) return org;

  const { data: created, error } = await admin
    .from("organizations")
    .insert({
      name: "Transportes Demo SRL",
      legal_name: "Transportes Demo SRL",
      email: "demo@flexcontrol.test",
      is_demo: true,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(`No se pudo crear la organización demo: ${error.message}`);
  await admin.from("organization_settings").insert({ organization_id: created.id });
  console.log(`  + Organización demo creada: ${created.name}`);
  return created;
}

async function getOrCreateDriver(orgId) {
  const { data: driver } = await admin
    .from("drivers")
    .select("id, first_name, last_name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (driver) return driver;

  const { data: created, error } = await admin
    .from("drivers")
    .insert({ organization_id: orgId, first_name: "Juan", last_name: "Pérez", status: "active" })
    .select("id, first_name, last_name")
    .single();
  if (error) throw new Error(`No se pudo crear el repartidor: ${error.message}`);
  console.log("  + Repartidor Juan Pérez creado");
  return created;
}

async function getOrCreateClient(orgId) {
  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (client) return client;

  const { data: created, error } = await admin
    .from("clients")
    .insert({ organization_id: orgId, name: "Comercio Demo", contact_name: "Hugo Comercio" })
    .select("id, name")
    .single();
  if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`);
  console.log("  + Cliente Comercio Demo creado");
  return created;
}

async function main() {
  console.log(`Conectando a ${url} …\n`);
  const org = await getOrCreateDemoOrg();
  const driver = await getOrCreateDriver(org.id);
  const client = await getOrCreateClient(org.id);

  for (const spec of USERS) {
    const user = await getOrCreateAuthUser(spec.email, spec.name);

    const { error: profileError } = await admin
      .from("platform_users")
      .upsert({ id: user.id, full_name: spec.name });
    if (profileError) throw new Error(`platform_users ${spec.email}: ${profileError.message}`);

    const membership = {
      organization_id: org.id,
      user_id: user.id,
      role: spec.role,
      status: "active",
      joined_at: new Date().toISOString(),
      driver_id: spec.role === "driver" ? driver.id : null,
      client_id: spec.role === "client" ? client.id : null,
    };
    const { error: memberError } = await admin
      .from("organization_members")
      .upsert(membership, { onConflict: "organization_id,user_id" });
    if (memberError) throw new Error(`membership ${spec.email}: ${memberError.message}`);

    console.log(`  ✔ ${spec.role.padEnd(8)} ${spec.email}`);
  }

  console.log(`\nListo. Ingresá en la app con cualquiera de estos usuarios:`);
  console.log(`  Contraseña (todos): ${PASSWORD}`);
  console.log(`  Organización: ${org.name}`);
  console.log(`  El repartidor está vinculado a ${driver.first_name} ${driver.last_name} (ve /driver).`);
  console.log(`  El usuario comercio está vinculado a "${client.name}".`);
}

main().catch((err) => {
  console.error(`\n✖ Error: ${err.message ?? err}`);
  process.exit(1);
});
