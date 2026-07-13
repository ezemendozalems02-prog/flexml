import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/mercadolibre/auth-service";
import { syncConnection } from "@/lib/mercadolibre/sync-service";

/**
 * GET /api/oauth/mercadolibre/callback?code=...&state=...
 * Callback de autorización de Mercado Libre. Valida el state, intercambia
 * el code por tokens (cifrados en reposo) y dispara la primera
 * sincronización. Redirige al panel de conexiones con el resultado.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(`${base}/connections?error=missing_params`);
  }

  try {
    const result = await handleOAuthCallback(code, state);

    // Primera sincronización inmediata (mejor esfuerzo; el cron la retoma si falla)
    try {
      await syncConnection(result.connectionId, { jobType: "initial_import" });
    } catch (syncErr) {
      console.error("Sincronización inicial falló (el cron reintenta):", syncErr);
    }

    return NextResponse.redirect(
      `${base}/connections?connected=${encodeURIComponent(result.nickname ?? "ok")}`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${base}/connections?error=oauth_failed`);
  }
}
