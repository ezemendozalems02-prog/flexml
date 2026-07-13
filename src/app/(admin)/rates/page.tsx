import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/billing/engine";
import { internalStatusLabel, INTERNAL_STATUSES } from "@/lib/domain/statuses";
import {
  BillingRuleRow,
  CreateRateForm,
  RetryModeForm,
} from "@/components/billing/rate-forms";

export const metadata = { title: "Tarifas" };

export default async function RatesPage() {
  const session = await requireRole(["owner", "admin"]);
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: zones }, { data: clients }, { data: zoneRates }, { data: clientRates }, { data: rules }] =
    await Promise.all([
      supabase.from("zones").select("id, name, color").eq("organization_id", orgId).is("deleted_at", null).order("priority"),
      supabase.from("clients").select("id, name, retry_billing_mode").eq("organization_id", orgId).is("deleted_at", null).order("name"),
      supabase
        .from("zone_rates")
        .select("*")
        .eq("organization_id", orgId)
        .order("valid_from", { ascending: false }),
      supabase
        .from("client_zone_rates")
        .select("*, clients(name)")
        .eq("organization_id", orgId)
        .order("valid_from", { ascending: false }),
      supabase
        .from("billing_rules")
        .select("*")
        .eq("applies_to", "status")
        .eq("active", true)
        .or(`organization_id.is.null,organization_id.eq.${orgId}`),
    ]);

  const zoneName = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const today = new Date().toISOString().slice(0, 10);
  const isCurrent = (r: { valid_from: string; valid_to: string | null }) =>
    r.valid_from <= today && (r.valid_to === null || r.valid_to >= today);

  // Regla efectiva por estado: la propia de la org pisa la global
  const effectiveRules = new Map<string, { charge: string; fixed_amount: number | null; percent: number | null; isOverride: boolean }>();
  for (const r of rules ?? []) {
    const existing = effectiveRules.get(r.rule_key);
    if (!existing || r.organization_id !== null) {
      effectiveRules.set(r.rule_key, {
        charge: r.charge,
        fixed_amount: r.fixed_amount !== null ? Number(r.fixed_amount) : null,
        percent: r.percent !== null ? Number(r.percent) : null,
        isOverride: r.organization_id !== null,
      });
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tarifas y reglas de cobro</h1>
        <p className="text-sm text-slate-500">
          Prioridad de precio: tarifa personalizada del cliente → tarifa general de la zona.
          Cada envío congela el precio con el que se calculó: los cambios futuros nunca
          alteran semanas anteriores.
        </p>
      </div>

      {/* Tarifas generales por zona */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Tarifas generales por zona</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3">Precio base</th>
                <th className="px-4 py-3">Reintento</th>
                <th className="px-4 py-3">Devolución</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(zoneRates ?? []).map((r) => (
                <tr key={r.id} className={isCurrent(r) ? "" : "text-slate-400"}>
                  <td className="px-4 py-2.5 font-medium">{zoneName.get(r.zone_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">{formatMoney(Number(r.price), r.currency)}</td>
                  <td className="px-4 py-2.5">
                    {r.retry_price !== null ? formatMoney(Number(r.retry_price), r.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.return_price !== null ? formatMoney(Number(r.return_price), r.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.valid_from} → {r.valid_to ?? "vigente"}
                  </td>
                  <td className="px-4 py-2.5">
                    {isCurrent(r) ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Vigente
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">Histórica</span>
                    )}
                  </td>
                </tr>
              ))}
              {(zoneRates ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Sin tarifas: los envíos quedarán “Sin precio” hasta crear la primera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tarifas personalizadas */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Tarifas personalizadas por cliente</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3">Precio base</th>
                <th className="px-4 py-3">Reintento</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(clientRates ?? []).map((r) => (
                <tr key={r.id} className={isCurrent(r) ? "" : "text-slate-400"}>
                  <td className="px-4 py-2.5 font-medium">
                    {(r.clients as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{zoneName.get(r.zone_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">{formatMoney(Number(r.price), r.currency)}</td>
                  <td className="px-4 py-2.5">
                    {r.retry_price !== null ? formatMoney(Number(r.retry_price), r.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.valid_from} → {r.valid_to ?? "vigente"}
                  </td>
                  <td className="px-4 py-2.5">
                    {isCurrent(r) ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Vigente
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">Histórica</span>
                    )}
                  </td>
                </tr>
              ))}
              {(clientRates ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Sin tarifas personalizadas: se usa la tarifa general de cada zona.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Nueva tarifa</h2>
        <CreateRateForm zones={zones ?? []} clients={clients ?? []} />
      </section>

      {/* Modalidad de reintentos por cliente */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Cobro de reintentos por cliente</h2>
          <p className="text-sm text-slate-500">
            Solo entrega final · Entrega + 1 reintento · Cada visita realizada.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {(clients ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <span className="text-sm font-medium text-slate-800">{c.name}</span>
              <RetryModeForm clientId={c.id} current={c.retry_billing_mode} />
            </li>
          ))}
        </ul>
      </section>

      {/* Reglas de cobro por estado */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Qué envíos se cobran (regla por estado)</h2>
          <p className="text-sm text-slate-500">
            Cobrable al 100% del precio de zona · importe fijo · porcentaje · no cobrable ·
            requiere revisión manual.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <tbody className="divide-y divide-slate-100">
              {INTERNAL_STATUSES.map((status) => {
                const rule = effectiveRules.get(status);
                return (
                  <BillingRuleRow
                    key={status}
                    ruleKey={status}
                    label={internalStatusLabel(status)}
                    charge={rule?.charge ?? "none"}
                    fixedAmount={rule?.fixed_amount ?? null}
                    percent={rule?.percent ?? null}
                    isOverride={rule?.isOverride ?? false}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
