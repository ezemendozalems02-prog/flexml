import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { startOAuthFlow } from "@/lib/mercadolibre/auth-service";

const querySchema = z.object({ clientId: z.string().uuid() });

/**
 * GET /api/oauth/mercadolibre/start?clientId=<uuid>
 * Inicia el flujo OAuth para conectar la cuenta de ML de un cliente.
 * Requiere sesión con rol owner/admin en la organización dueña del cliente.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const parsed = querySchema.safeParse({
    clientId: request.nextUrl.searchParams.get("clientId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "clientId inválido" }, { status: 400 });
  }

  // RLS garantiza que solo se ven clientes de la propia organización
  const { data: client } = await supabase
    .from("clients")
    .select("id, organization_id")
    .eq("id", parsed.data.clientId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", client.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const authUrl = await startOAuthFlow({
      organizationId: client.organization_id,
      clientId: client.id,
      userId: user.id,
    });
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error iniciando OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
