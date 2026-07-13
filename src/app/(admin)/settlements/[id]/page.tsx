import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/billing/engine";
import { SETTLEMENT_STATUS_LABEL } from "@/lib/billing/settlement-status";
import {
  buildWhatsAppMessage,
  CONCEPT_LABELS,
  type ValidationIssue,
} from "@/lib/billing/settlement-service";
import {
  AddAdjustmentForm,
  TransitionButton,
  WhatsAppBox,
} from "@/components/billing/settlement-forms";
import { internalStatusLabel } from "@/lib/domain/statuses";
import { AlertTriangle, ArrowLeft, Download, Printer } from "lucide-react";

export const metadata = { title: "Liquidación" };

const ADJ_LABELS: Record<string, string> = {
  discount: "Descuento",
  surcharge: "Recargo",
  bonus: "Bonificación",
  correction: "Corrección",
  special_trip: "Viaje especial",
  wait: "Espera",
  toll: "Peaje",
  extra_pickup: "Retiro adicional",
  other: "Otro",
};

type ZoneSummaryRow = {
  zone_id: string | null;
  zone_name: string;
  count: number;
  unit_price: number;
  subtotal: number;
};

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("weekly_settlements")
    .select("*, clients(name)")
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!s) notFound();

  const [{ data: accounts }, { data: adjustments }, { data: items }] = await Promise.all([
    supabase
      .from("weekly_settlement_accounts")
      .select("*")
      .eq("settlement_id", id)
      .order("subtotal", { ascending: false }),
    supabase
      .from("weekly_settlement_adjustments")
      .select("*, platform_users(full_name)")
      .eq("settlement_id", id)
      .order("created_at"),
    supabase
      .from("weekly_settlement_items")
      .select(
        `*, zones(name),
         shipments(external_shipment_id, external_order_id, internal_status, attempt_count, created_at,
                   drivers(first_name, last_name), shipment_addresses(city))`
      )
      .eq("settlement_id", id)
      .order("amount", { ascending: false })
      .limit(1000),
  ]);

  const clientName = (s.clients as unknown as { name: string } | null)?.name ?? "Cliente";
  const st = SETTLEMENT_STATUS_LABEL[s.status] ?? SETTLEMENT_STATUS_LABEL.draft;
  const issues = (s.validation_issues ?? []) as ValidationIssue[];
  const currency = s.currency as string;

  // Resumen consolidado por zona (todas las cuentas)
  const consolidated = new Map<string, ZoneSummaryRow>();
  for (const acc of accounts ?? []) {
    for (const z of (acc.zone_summary ?? []) as ZoneSummaryRow[]) {
      const key = z.zone_id ?? "sin-zona";
      const agg = consolidated.get(key) ?? { ...z, count: 0, subtotal: 0 };
      agg.count += z.count;
      agg.subtotal += z.subtotal;
      agg.unit_price = z.unit_price;
      consolidated.set(key, agg);
    }
  }
  const zoneRows = [...consolidated.values()].sort((a, b) => b.subtotal - a.subtotal);

  const concepts = (s.counts as { concepts?: Record<string, { quantity: number; amount: number }> })
    ?.concepts ?? {};
  const conceptRows = Object.entries(concepts).filter(([, v]) => v.amount > 0);

  const whatsapp = buildWhatsAppMessage({
    clientName,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    zoneLines: zoneRows.map((z) => ({ zone: z.zone_name, count: z.count, subtotal: z.subtotal })),
    concepts: conceptRows.map(([key, v]) => ({
      label: CONCEPT_LABELS[key] ?? key,
      amount: v.amount,
    })),
    adjustmentsTotal: Number(s.adjustments_total),
    total: Number(s.total),
    currency,
  });

  const counts = s.counts as { shipments?: number; billable?: number; not_billable?: number };
  const editable = !["paid", "void", "sent"].includes(s.status);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/settlements" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{s.number}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>
              {st.label}
            </span>
            <span className="text-sm text-slate-500">v{s.version}</span>
          </div>
          <p className="text-sm text-slate-500">
            {clientName} · Semana del {s.period_start} al {s.period_end} · Generada el{" "}
            {new Date(s.generated_at).toLocaleString("es-AR")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/settlements/${s.id}/export`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> CSV / Excel
          </a>
          <a
            href={`/settlements/${s.id}?print=1`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </a>
          {["draft", "pending_review", "reviewed"].includes(s.status) && (
            <TransitionButton settlementId={s.id} action="confirm" label="Confirmar" variant="primary" />
          )}
          {s.status === "confirmed" && (
            <TransitionButton settlementId={s.id} action="send" label="Marcar enviada" variant="primary" />
          )}
          {["confirmed", "sent", "partially_paid", "overdue"].includes(s.status) && (
            <TransitionButton settlementId={s.id} action="mark_paid" label="Marcar pagada" variant="success" />
          )}
          {!["paid", "void"].includes(s.status) && (
            <TransitionButton settlementId={s.id} action="void" label="Anular" variant="danger" />
          )}
        </div>
      </div>

      {/* Encabezado imprimible */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{session.organization.name} — Liquidación {s.number}</h1>
        <p className="text-sm">
          Cliente: {clientName} · Período: {s.period_start} a {s.period_end} · Emitida:{" "}
          {new Date().toLocaleDateString("es-AR")}
        </p>
      </div>

      {/* Validaciones */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 print:hidden">
          <div className="flex items-center gap-2 font-medium text-orange-800">
            <AlertTriangle className="h-4 w-4" /> Problemas detectados — resolver antes de confirmar
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-orange-700">
            {issues.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-orange-600">
            Corregí en <Link href="/locations" className="underline">Localidades</Link> /{" "}
            <Link href="/rates" className="underline">Tarifas</Link> y volvé a generar la
            liquidación (crea una nueva versión).
          </p>
        </div>
      )}

      {/* Totales */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Envíos del período</p>
          <p className="mt-1 text-xl font-bold">
            {counts.shipments ?? 0}{" "}
            <span className="text-sm font-normal text-slate-500">
              ({counts.billable ?? 0} cobrables)
            </span>
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Subtotal envíos</p>
          <p className="mt-1 text-xl font-bold">{formatMoney(Number(s.shipments_subtotal), currency)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Adicionales + ajustes</p>
          <p className="mt-1 text-xl font-bold">
            {formatMoney(Number(s.additionals_subtotal) + Number(s.adjustments_total), currency)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-sm text-slate-300">Total a cobrar</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(Number(s.total), currency)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Resumen por cuenta de ML */}
          {(accounts ?? []).map((acc) => (
            <section key={acc.id} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">Cuenta: {acc.nickname}</h2>
                <span className="font-semibold">{formatMoney(Number(acc.subtotal), currency)}</span>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2">Zona</th>
                    <th className="px-5 py-2 text-right">Cantidad</th>
                    <th className="px-5 py-2 text-right">Precio unitario</th>
                    <th className="px-5 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {((acc.zone_summary ?? []) as ZoneSummaryRow[]).map((z, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2">{z.zone_name}</td>
                      <td className="px-5 py-2 text-right">{z.count}</td>
                      <td className="px-5 py-2 text-right">{formatMoney(z.unit_price, currency)}</td>
                      <td className="px-5 py-2 text-right font-medium">
                        {formatMoney(z.subtotal, currency)}
                      </td>
                    </tr>
                  ))}
                  {((acc.zone_summary ?? []) as ZoneSummaryRow[]).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                        Sin envíos cobrables en esta cuenta.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ))}

          {/* Adicionales */}
          {conceptRows.length > 0 && (
            <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">Adicionales</h2>
              </div>
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {conceptRows.map(([key, v]) => (
                    <tr key={key}>
                      <td className="px-5 py-2">{CONCEPT_LABELS[key] ?? key}</td>
                      <td className="px-5 py-2 text-right">{v.quantity}</td>
                      <td className="px-5 py-2 text-right font-medium">
                        {formatMoney(v.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Ajustes */}
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Ajustes manuales</h2>
              <span className="font-semibold">
                {formatMoney(Number(s.adjustments_total), currency)}
              </span>
            </div>
            {(adjustments ?? []).length > 0 ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {(adjustments ?? []).map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium">
                        {ADJ_LABELS[a.adj_type] ?? a.adj_type}: {a.description}
                      </p>
                      <p className="text-xs text-slate-500">
                        Motivo: {a.reason} ·{" "}
                        {(a.platform_users as unknown as { full_name: string | null } | null)
                          ?.full_name ?? "—"}{" "}
                        · {new Date(a.created_at).toLocaleString("es-AR")}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${Number(a.amount) < 0 ? "text-red-600" : "text-slate-900"}`}
                    >
                      {formatMoney(Number(a.amount), currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-slate-500">Sin ajustes.</p>
            )}
            {editable && (
              <div className="border-t border-slate-100 px-5 py-4 print:hidden">
                <AddAdjustmentForm settlementId={s.id} />
              </div>
            )}
          </section>

          {/* Detalle de envíos */}
          <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Detalle de envíos ({(items ?? []).length} conceptos)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">Envío</th>
                    <th className="px-4 py-2">Localidad</th>
                    <th className="px-4 py-2">Zona</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Repartidor</th>
                    <th className="px-4 py-2">Concepto</th>
                    <th className="px-4 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(items ?? []).map((item) => {
                    const ship = item.shipments as unknown as {
                      external_shipment_id: string | null;
                      internal_status: string;
                      attempt_count: number;
                      drivers: { first_name: string; last_name: string } | null;
                      shipment_addresses: { city: string | null } | null;
                    } | null;
                    return (
                      <tr key={item.id} className={item.excluded ? "text-slate-400" : ""}>
                        <td className="px-4 py-2">
                          {item.shipment_id ? (
                            <Link
                              href={`/shipments/${item.shipment_id}`}
                              className="font-medium text-blue-700 hover:underline"
                            >
                              #{ship?.external_shipment_id ?? "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">{ship?.shipment_addresses?.city ?? "—"}</td>
                        <td className="px-4 py-2">
                          {(item.zones as unknown as { name: string } | null)?.name ?? "Sin zona"}
                        </td>
                        <td className="px-4 py-2">
                          {ship ? internalStatusLabel(ship.internal_status) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {ship?.drivers ? `${ship.drivers.first_name} ${ship.drivers.last_name}` : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {CONCEPT_LABELS[item.concept] ?? item.concept}
                          {item.excluded && (
                            <span className="ml-1 text-xs">
                              (no cobrado: {item.exclusion_reason ?? "—"})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {item.excluded ? "—" : formatMoney(Number(item.amount), currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6 print:hidden">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Resumen consolidado por zona</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {zoneRows.map((z, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{z.zone_name}</td>
                    <td className="py-1.5 text-right">{z.count}</td>
                    <td className="py-1.5 text-right font-medium">
                      {formatMoney(z.subtotal, currency)}
                    </td>
                  </tr>
                ))}
                {zoneRows.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-slate-500">Sin envíos cobrables</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Mensaje para WhatsApp</h2>
            <WhatsAppBox message={whatsapp} />
          </section>
        </div>
      </div>
    </div>
  );
}
