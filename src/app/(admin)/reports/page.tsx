import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildWeeklyReport, getWeekStart } from "@/lib/reports/weekly";
import { Download } from "lucide-react";

export const metadata = { title: "Reportes" };

type SearchParams = Promise<{ week?: string; client?: string; connection?: string }>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const weekStart = params.week ? getWeekStart(new Date(params.week)) : getWeekStart(new Date());
  const report = await buildWeeklyReport({
    organizationId: session.organization.id,
    weekStart,
    clientId: params.client,
    connectionId: params.connection,
  });

  const [{ data: clients }, { data: connections }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", session.organization.id)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("marketplace_connections")
      .select("id, nickname")
      .eq("organization_id", session.organization.id),
  ]);

  const weekValue = weekStart.toISOString().slice(0, 10);
  const fmt = (d: Date) => d.toLocaleDateString("es-AR");
  const csvHref = `/reports/export?week=${weekValue}${params.client ? `&client=${params.client}` : ""}${params.connection ? `&connection=${params.connection}` : ""}`;

  const t = report.totals;
  const summary = [
    { label: "Ingresados", value: t.ingested },
    { label: "Entregados", value: t.delivered },
    { label: "Reprogramados", value: t.rescheduled },
    { label: "Cancelados", value: t.cancelled },
    { label: "Devueltos", value: t.returned },
    { label: "Con incidencia", value: t.withIncident },
    { label: "Pendientes", value: t.pending },
    { label: "Efectividad", value: t.effectiveness === null ? "—" : `${t.effectiveness}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reporte semanal</h1>
          <p className="text-sm text-slate-500">
            Semana del {fmt(report.weekStart)} al{" "}
            {fmt(new Date(report.weekEnd.getTime() - 86400_000))}
          </p>
        </div>
        <Link
          href={csvHref}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <Download className="h-4 w-4" /> Descargar CSV
        </Link>
      </div>

      <form className="flex flex-wrap gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Semana (cualquier día)</span>
          <input
            type="date"
            name="week"
            defaultValue={weekValue}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Cliente</span>
          <select name="client" defaultValue={params.client ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Todos</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Cuenta ML</span>
          <select name="connection" defaultValue={params.connection ?? ""} className="rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Todas</option>
            {(connections ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname ?? c.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Generar
        </button>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summary.map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Por estado</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {report.byStatus.map((row) => (
                <tr key={row.status}>
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right font-medium">{row.count}</td>
                  <td className="py-1.5 text-right text-slate-500">{row.pct}%</td>
                </tr>
              ))}
              {report.byStatus.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-slate-500">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Por repartidor</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Repartidor</th>
                <th className="py-1 text-right">Asig.</th>
                <th className="py-1 text-right">Entr.</th>
                <th className="py-1 text-right">Efect.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.byDriver.map((row) => (
                <tr key={row.driver}>
                  <td className="py-1.5">{row.driver}</td>
                  <td className="py-1.5 text-right">{row.assigned}</td>
                  <td className="py-1.5 text-right">{row.delivered}</td>
                  <td className="py-1.5 text-right text-slate-500">
                    {row.effectiveness === null ? "—" : `${row.effectiveness}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Por zona</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Zona</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Entr.</th>
                <th className="py-1 text-right">Incid.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.byZone.map((row) => (
                <tr key={row.zone}>
                  <td className="py-1.5">{row.zone}</td>
                  <td className="py-1.5 text-right">{row.total}</td>
                  <td className="py-1.5 text-right">{row.delivered}</td>
                  <td className="py-1.5 text-right text-slate-500">{row.incidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
