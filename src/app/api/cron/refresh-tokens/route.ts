import { NextRequest, NextResponse } from "next/server";
import { refreshExpiringTokens } from "@/lib/mercadolibre/token-service";

export const maxDuration = 120;

/**
 * GET /api/cron/refresh-tokens — renueva credenciales próximas a vencer.
 * La renovación depende de la autorización vigente en Mercado Libre; las
 * conexiones irrecuperables quedan en needs_reauth para reconectar a mano.
 *
 * Vercel Cron está deshabilitado por ahora (plan Hobby, solo 1x/día); este
 * endpoint sigue funcionando igual disparado a mano o desde un scheduler
 * externo (ver README § Procesos programados).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await refreshExpiringTokens();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
