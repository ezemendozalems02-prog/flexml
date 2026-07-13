import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAuthorizationUrl } from "./provider";
import { getMercadoLibreProvider, isMockMode } from "./index";
import { persistTokens } from "./token-service";

/**
 * MercadoLibreAuthService — flujo OAuth completo.
 * 1) start: genera state seguro, lo persiste con org/cliente/usuario y
 *    redirige a la autorización de ML.
 * 2) callback: valida state (una sola vez, con expiración), intercambia el
 *    code por tokens, identifica al vendedor, crea/actualiza la conexión
 *    con tokens cifrados y encola la sincronización inicial.
 */

const STATE_TTL_MS = 15 * 60 * 1000;

export async function startOAuthFlow(params: {
  organizationId: string;
  clientId: string;
  userId: string;
}): Promise<string> {
  const admin = createAdminClient();
  const state = randomBytes(32).toString("hex");

  const { error } = await admin.from("oauth_states").insert({
    state,
    organization_id: params.organizationId,
    client_id: params.clientId,
    user_id: params.userId,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`No se pudo iniciar OAuth: ${error.message}`);

  if (isMockMode()) {
    // En modo mock se salta la pantalla de ML y se vuelve directo al callback
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/mercadolibre/callback?code=MOCK-${state.slice(0, 8)}&state=${state}`;
  }

  return buildAuthorizationUrl({
    clientId: process.env.MERCADOLIBRE_CLIENT_ID!,
    redirectUri: process.env.MERCADOLIBRE_REDIRECT_URI!,
    state,
  });
}

export interface OAuthCallbackResult {
  connectionId: string;
  nickname: string | null;
  organizationId: string;
}

export async function handleOAuthCallback(code: string, state: string): Promise<OAuthCallbackResult> {
  const admin = createAdminClient();

  // Validar state: existente, no usado, no vencido — y marcarlo usado.
  const { data: stateRow } = await admin
    .from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("organization_id, client_id, user_id")
    .maybeSingle();

  if (!stateRow) throw new Error("State inválido, vencido o ya utilizado");

  const provider = getMercadoLibreProvider();
  const tokens = await provider.exchangeCode(
    code,
    process.env.MERCADOLIBRE_REDIRECT_URI ?? ""
  );
  const me = await provider.getMe({ accessToken: tokens.access_token });

  // Crear o reactivar la conexión (única por org + vendedor)
  const { data: conn, error } = await admin
    .from("marketplace_connections")
    .upsert(
      {
        organization_id: stateRow.organization_id,
        client_id: stateRow.client_id,
        provider: "mercadolibre",
        external_user_id: String(me.id),
        nickname: me.nickname,
        site_id: me.site_id,
        status: "connecting",
        connected_at: new Date().toISOString(),
        connected_by: stateRow.user_id,
        disconnected_at: null,
        is_mock: isMockMode(),
      },
      { onConflict: "organization_id,provider,external_user_id" }
    )
    .select("id")
    .single();
  if (error || !conn) throw new Error(`No se pudo guardar la conexión: ${error?.message}`);

  await persistTokens(conn.id, tokens);

  // Encolar sincronización inicial
  await admin.from("marketplace_sync_jobs").insert({
    organization_id: stateRow.organization_id,
    connection_id: conn.id,
    job_type: "initial_import",
    status: "queued",
  });

  await admin.from("audit_logs").insert({
    organization_id: stateRow.organization_id,
    user_id: stateRow.user_id,
    action: "marketplace.connected",
    resource_type: "marketplace_connection",
    resource_id: conn.id,
    new_data: { nickname: me.nickname, site_id: me.site_id },
  });

  return {
    connectionId: conn.id,
    nickname: me.nickname,
    organizationId: stateRow.organization_id,
  };
}
