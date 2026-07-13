import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/billing/engine";
import { GenerateSettlementForm } from "@/components/billing/settlement-forms";
import { getWeekStart, toDateString } from "@/lib/reports/weekly";
import { SETTLEMENT_STATUS_LABEL } from "@/lib/billing/settlement-status";

export const metadata = { title: "Liquidaciones" };

export default async function SettlementsPage() {
  const session = await requireRole(["owner", "admin"]);
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: settlements }, { data: clients }, { data: problemCalcs }] = await Promise.all([
    supabase
      .from("weekly_settlements")
      .select("id, number, period_start, period_end, status, total, currency, version, clients(name)")
      .eq("organization_id", orgId)
      .order("period_start", { ascending: false })
      .order("version", { ascending: false })
      .limit(50),
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("shipment_rate_calculations")
      .select("status")
      .eq("organization_id", orgId)
      .in("status", ["no_zone", "no_rate", "review"]),
  ]);

  const weekStart = toDateString(getWeekStart(new Date()));
  const rows = settlements ?? [];
  const sum = (pred: (s: (typeof rows)[number]) => boolean) =>
    rows.filter(pred).reduce((acc, s) => acc + Number(s.total), 0);

  const noZone = (problemCalcs ?? []).filter((c) => c.status === "no_zone").length;
  const noRate = (problemCalcs ?? []).filter((c) => c.status === "no_rate").length;
  const review = (problemCalcs ?? []).filter((c) => c.status === "review").length;

  const indicators = [
    { label: "Facturado esta semana", value: formatMoney(sum((s) => s.period_start === weekStart && s.status !== "void")) },
    { label: "Pendiente de revisión", value: formatMoney(sum((s) => ["draft", "pending_review"].includes(s.status))) },
    { label: "Enviado a clientes", value: formatMoney(sum((s) => s.status === "sent")) },
    { label: "Cobrado", value: formatMoney(sum((s) => s.status === "paid")) },
    { label: "Pendiente de cobro", value: formatMoney(sum((s) => ["confirmed", "sent", "partially_paid", "overdue"].includes(s.status))) },
    { label: "Envíos sin zona", value: String(noZone) },
    { label: "Envíos sin precio", value: String(noRate) },
    { label: "Cobros a revisar", value: String(review) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Liquidaciones semanales</h1>
        <p className="text-sm text-slate-500">
          Cálculo automático por cliente: localidad → zona → tarifa → reglas de cobro →
          total de la semana.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {indicators.map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {(noZone > 0 || noRate > 0) && (
        <p className="rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-800 ring-1 ring-orange-200">
          Hay envíos sin zona o sin precio. Revisá{" "}
          <Link href="/locations" className="font-medium underline">
            Localidades
          </Link>{" "}
          y{" "}
          <Link href="/rates" className="font-medium underline">
            Tarifas
          </Link>{" "}
          antes de confirmar liquidaciones.
        </p>
      )}

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Generar liquidación semanal</h2>
        <GenerateSettlementForm clients={clients ?? []} />
      </section>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Versión</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => {
              const st = SETTLEMENT_STATUS_LABEL[s.status] ?? SETTLEMENT_STATUS_LABEL.draft;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/settlements/${s.id}`} className="font-medium text-blue-700 hover:underline">
                      {s.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {(s.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.period_start} → {s.period_end}
                  </td>
                  <td className="px-4 py-3 text-slate-600">v{s.version}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(Number(s.total), s.currency)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay liquidaciones. Generá la primera arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
