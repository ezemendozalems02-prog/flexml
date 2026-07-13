import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/encryption";
import { getMercadoLibreProvider } from "./index";
import type { MLTokenResponse } from "./provider";

/**
 * MercadoLibreTokenService — guarda credenciales cifradas y las renueva
 * antes del vencimiento, con lock lógico para evitar renovaciones
 * simultáneas. La conexión depende SIEMPRE de la autorización vigente en
 * Mercado Libre: si la renovación falla de forma irrecuperable, la conexión
 * pasa a `needs_reauth` y el usuario debe reconectar.
 */

/** Renovar cuando falten menos de 60 minutos. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
const LOCK_DURATION_MS = 2 * 60 * 1000;

export async function persistTokens(connectionId: string, tokens: MLTokenResponse) {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error } = await admin
    .from("marketplace_connections")
    .update({
      access_token_encrypted: encryptSecret(tokens.access_token),
      refresh_token_encrypted: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : null,
      token_expires_at: expiresAt,
      scopes: tokens.scope ? tokens.scope.split(" ") : [],
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: null,
      status: "active",
      consecutive_errors: 0,
    })
    .eq("id", connectionId);

  if (error) throw new Error(`No se pudieron guardar los tokens: ${error.message}`);

  await admin.from("marketplace_token_events").insert({
    connection_id: connectionId,
    event: "issued",
    detail: `vence ${expiresAt}`,
  });
}

/**
 * Devuelve un access token vigente para la conexión, renovando si es
 * necesario. Lanza si la conexión requiere reconexión manual.
 */
export async function getValidAccessToken(connectionId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: conn, error } = await admin
    .from("marketplace_connections")
    .select(
      "id, status, access_token_encrypted, refresh_token_encrypted, token_expires_at, refresh_lock_until"
    )
    .eq("id", connectionId)
    .single();

  if (error || !conn) throw new Error("Conexión no encontrada");
  if (["disconnected", "auth_revoked", "needs_reauth"].includes(conn.status)) {
    throw new Error(`La conexión requiere reconexión (estado: ${conn.status})`);
  }
  if (!conn.access_token_encrypted) throw new Error("La conexión no tiene credenciales");

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const needsRefresh = expiresAt - Date.now() < REFRESH_MARGIN_MS;

  if (!needsRefresh) {
    return decryptSecret(conn.access_token_encrypted);
  }
  return refreshConnectionToken(connectionId);
}

/** Renueva el token de una conexión usando lock lógico. */
export async function refreshConnectionToken(connectionId: string): Promise<string> {
  const admin = createAdminClient();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();

  // Tomar el lock solo si está libre o vencido (update condicional atómico).
  const { data: locked } = await admin
    .from("marketplace_connections")
    .update({ refresh_lock_until: lockUntil })
    .eq("id", connectionId)
    .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${now.toISOString()}`)
    .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .maybeSingle();

  if (!locked) {
    // Otro proceso está renovando: esperar brevemente y leer el resultado.
    await new Promise((r) => setTimeout(r, 3000));
    const { data: conn } = await admin
      .from("marketplace_connections")
      .select("access_token_encrypted")
      .eq("id", connectionId)
      .single();
    if (conn?.access_token_encrypted) return decryptSecret(conn.access_token_encrypted);
    throw new Error("Renovación concurrente en curso; reintentar");
  }

  try {
    if (!locked.refresh_token_encrypted) {
      throw new Error("Sin refresh token disponible");
    }
    const refreshToken = decryptSecret(locked.refresh_token_encrypted);
    const tokens = await getMercadoLibreProvider().refreshToken(refreshToken);
    await persistTokens(connectionId, tokens);
    await admin.from("marketplace_token_events").insert({
      connection_id: connectionId,
      event: "refreshed",
    });
    return tokens.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("marketplace_connections")
      .update({
        last_refresh_error: message,
        status: "needs_reauth",
      })
      .eq("id", connectionId);
    await admin.from("marketplace_token_events").insert({
      connection_id: connectionId,
      event: "refresh_failed",
      detail: message,
    });
    throw err;
  } finally {
    await admin
      .from("marketplace_connections")
      .update({ refresh_lock_until: null })
      .eq("id", connectionId);
  }
}

/** Renueva todas las conexiones activas próximas a vencer (job de cron). */
export async function refreshExpiringTokens(): Promise<{ checked: number; refreshed: number; failed: number }> {
  const admin = createAdminClient();
  const threshold = new Date(Date.now() + REFRESH_MARGIN_MS).toISOString();

  const { data: expiring } = await admin
    .from("marketplace_connections")
    .select("id")
    .in("status", ["active", "error", "token_expired"])
    .not("refresh_token_encrypted", "is", null)
    .lt("token_expires_at", threshold)
    .limit(50);

  let refreshed = 0;
  let failed = 0;
  for (const conn of expiring ?? []) {
    try {
      await refreshConnectionToken(conn.id);
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { checked: expiring?.length ?? 0, refreshed, failed };
}
