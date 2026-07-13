import "server-only";

import { createClient } from "@/lib/supabase/server";
import { internalStatusLabel, INTERNAL_STATUS_META, type InternalStatus } from "@/lib/domain/statuses";

/**
 * Métricas del reporte semanal. La semana operativa es lunes–domingo.
 * Los cálculos se hacen sobre los envíos creados dentro de la semana
 * seleccionada (fecha de ingreso al sistema).
 */

export interface WeeklyReportFilters {
  organizationId: string;
  weekStart: Date; // lunes 00:00
  clientId?: string;
  connectionId?: string;
}

export interface WeeklyReportRow {
  id: string;
  external_shipment_id: string | null;
  created_at: string;
  internal_status: InternalStatus;
  external_status: string | null;
  attempt_count: number;
  is_flex: boolean | null;
  client_name: string;
  connection_nickname: string | null;
  zone_name: string | null;
  driver_name: string | null;
  city: string | null;
}

export interface WeeklyReport {
  weekStart: Date;
  weekEnd: Date;
  totals: {
    ingested: number;
    delivered: number;
    rescheduled: number;
    cancelled: number;
    returned: number;
    withIncident: number;
    pending: number;
    effectiveness: number | null;
    totalAttempts: number;
  };
  byStatus: Array<{ status: string; label: string; count: number; pct: number }>;
  byDriver: Array<{ driver: string; assigned: number; delivered: number; failed: number; effectiveness: number | null }>;
  byZone: Array<{ zone: string; total: number; delivered: number; incidents: number; effectiveness: number | null }>;
  rows: WeeklyReportRow[];
}

/** YYYY-MM-DD en hora LOCAL (toISOString corre el día en UTC-3). */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const INCIDENT_STATUSES: InternalStatus[] = Object.entries(INTERNAL_STATUS_META)
  .filter(([, meta]) => meta.group === "incident")
  .map(([status]) => status as InternalStatus);

export async function buildWeeklyReport(filters: WeeklyReportFilters): Promise<WeeklyReport> {
  const supabase = await createClient();
  const weekStart = filters.weekStart;
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  let query = supabase
    .from("shipments")
    .select(
      `id, external_shipment_id, created_at, internal_status, external_status,
       attempt_count, is_flex,
       clients(name), marketplace_connections(nickname),
       zones(name), drivers(first_name, last_name), shipment_addresses(city)`
    )
    .eq("organization_id", filters.organizationId)
    .gte("created_at", weekStart.toISOString())
    .lt("created_at", weekEnd.toISOString())
    .limit(5000);

  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.connectionId) query = query.eq("connection_id", filters.connectionId);

  const { data } = await query;

  const rows: WeeklyReportRow[] = (data ?? []).map((s) => {
    const driver = s.drivers as unknown as { first_name: string; last_name: string } | null;
    return {
      id: s.id,
      external_shipment_id: s.external_shipment_id,
      created_at: s.created_at,
      internal_status: s.internal_status as InternalStatus,
      external_status: s.external_status,
      attempt_count: s.attempt_count,
      is_flex: s.is_flex,
      client_name: (s.clients as unknown as { name: string } | null)?.name ?? "Sin cliente",
      connection_nickname:
        (s.marketplace_connections as unknown as { nickname: string | null } | null)?.nickname ?? null,
      zone_name: (s.zones as unknown as { name: string } | null)?.name ?? null,
      driver_name: driver ? `${driver.first_name} ${driver.last_name}` : null,
      city: (s.shipment_addresses as unknown as { city: string | null } | null)?.city ?? null,
    };
  });

  const count = (pred: (r: WeeklyReportRow) => boolean) => rows.filter(pred).length;

  const delivered = count((r) => r.internal_status === "delivered");
  const cancelled = count((r) => r.internal_status.startsWith("cancelled"));
  const returned = count((r) =>
    ["returned", "pending_return", "returned_to_seller"].includes(r.internal_status)
  );
  const rescheduled = count((r) => r.internal_status === "rescheduled");
  const withIncident = count((r) => INCIDENT_STATUSES.includes(r.internal_status));
  const closed = delivered + cancelled + returned;
  const denominator = rows.length - cancelled; // cancelados no cuentan contra efectividad

  const byStatusMap = new Map<string, number>();
  for (const r of rows) {
    byStatusMap.set(r.internal_status, (byStatusMap.get(r.internal_status) ?? 0) + 1);
  }

  const byDriverMap = new Map<string, { assigned: number; delivered: number; failed: number }>();
  for (const r of rows) {
    const key = r.driver_name ?? "Sin asignar";
    const entry = byDriverMap.get(key) ?? { assigned: 0, delivered: 0, failed: 0 };
    entry.assigned++;
    if (r.internal_status === "delivered") entry.delivered++;
    if (INCIDENT_STATUSES.includes(r.internal_status)) entry.failed++;
    byDriverMap.set(key, entry);
  }

  const byZoneMap = new Map<string, { total: number; delivered: number; incidents: number }>();
  for (const r of rows) {
    const key = r.zone_name ?? "Sin zona";
    const entry = byZoneMap.get(key) ?? { total: 0, delivered: 0, incidents: 0 };
    entry.total++;
    if (r.internal_status === "delivered") entry.delivered++;
    if (INCIDENT_STATUSES.includes(r.internal_status)) entry.incidents++;
    byZoneMap.set(key, entry);
  }

  return {
    weekStart,
    weekEnd,
    totals: {
      ingested: rows.length,
      delivered,
      rescheduled,
      cancelled,
      returned,
      withIncident,
      pending: rows.length - closed,
      effectiveness: denominator > 0 ? Math.round((delivered / denominator) * 100) : null,
      totalAttempts: rows.reduce((acc, r) => acc + r.attempt_count, 0),
    },
    byStatus: [...byStatusMap.entries()]
      .map(([status, c]) => ({
        status,
        label: internalStatusLabel(status),
        count: c,
        pct: rows.length > 0 ? Math.round((c / rows.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
    byDriver: [...byDriverMap.entries()]
      .map(([driver, v]) => ({
        driver,
        ...v,
        effectiveness: v.assigned > 0 ? Math.round((v.delivered / v.assigned) * 100) : null,
      }))
      .sort((a, b) => b.assigned - a.assigned),
    byZone: [...byZoneMap.entries()]
      .map(([zone, v]) => ({
        zone,
        ...v,
        effectiveness: v.total > 0 ? Math.round((v.delivered / v.total) * 100) : null,
      }))
      .sort((a, b) => b.total - a.total),
    rows,
  };
}

export function reportToCsv(report: WeeklyReport): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "ID envío",
    "Fecha ingreso",
    "Cliente",
    "Cuenta ML",
    "Localidad",
    "Zona",
    "Repartidor",
    "Estado interno",
    "Estado ML",
    "Intentos",
    "Flex",
  ].join(";");
  const lines = report.rows.map((r) =>
    [
      esc(r.external_shipment_id ?? r.id),
      esc(new Date(r.created_at).toLocaleString("es-AR")),
      esc(r.client_name),
      esc(r.connection_nickname),
      esc(r.city),
      esc(r.zone_name ?? "Sin zona"),
      esc(r.driver_name ?? "Sin asignar"),
      esc(internalStatusLabel(r.internal_status)),
      esc(r.external_status),
      esc(r.attempt_count),
      esc(r.is_flex === null ? "" : r.is_flex ? "Sí" : "No"),
    ].join(";")
  );
  return [header, ...lines].join("\n");
}
