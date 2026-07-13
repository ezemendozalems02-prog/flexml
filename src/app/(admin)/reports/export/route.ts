import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { buildWeeklyReport, getWeekStart, reportToCsv } from "@/lib/reports/weekly";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /reports/export?week=YYYY-MM-DD[&client=...][&connection=...]
 * Exporta el reporte semanal a CSV respetando filtros y permisos (RLS).
 * Registra la exportación en la auditoría.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;

  const week = params.get("week");
  const weekStart = week ? getWeekStart(new Date(week)) : getWeekStart(new Date());

  const report = await buildWeeklyReport({
    organizationId: session.organization.id,
    weekStart,
    clientId: params.get("client") ?? undefined,
    connectionId: params.get("connection") ?? undefined,
  });

  const supabase = await createClient();
  await supabase.from("audit_logs").insert({
    organization_id: session.organization.id,
    user_id: session.userId,
    action: "report.exported",
    resource_type: "weekly_report",
    resource_id: weekStart.toISOString().slice(0, 10),
    new_data: { rows: report.rows.length, filters: Object.fromEntries(params) },
  });

  const csv = "﻿" + reportToCsv(report); // BOM para Excel
  const filename = `reporte-semanal-${weekStart.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
