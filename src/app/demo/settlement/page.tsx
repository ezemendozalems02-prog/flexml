import { demoSettlement, demoWhatsApp } from "@/lib/demo/fixtures";
import { formatMoney } from "@/lib/billing/engine";
import { WhatsAppBox } from "@/components/billing/settlement-forms";

export const metadata = { title: "Liquidación (demo)" };

export default function DemoSettlement() {
  const s = demoSettlement;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">{s.number}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {s.status}
        </span>
        <p className="w-full text-sm text-slate-500">
          {s.client} · Semana {s.period} · Ejemplo con los números de referencia del
          requerimiento
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Envíos cobrables</p>
          <p className="mt-1 text-xl font-bold">41</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Subtotal envíos</p>
          <p className="mt-1 text-xl font-bold">{formatMoney(s.shipmentsSubtotal)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Adicionales</p>
          <p className="mt-1 text-xl font-bold">{formatMoney(s.additionalsSubtotal)}</p>
        </div>
        <div className="rounded-xl bg-slate-900 p-4 text-white shadow-sm">
          <p className="text-sm text-slate-300">Total a cobrar</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(s.total)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {s.accounts.map((acc) => (
            <section key={acc.nickname} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="font-semibold">Cuenta: {acc.nickname}</h2>
                <span className="font-semibold">{formatMoney(acc.subtotal)}</span>
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
                  {acc.zones.map((z) => (
                    <tr key={z.zone}>
                      <td className="px-5 py-2">{z.zone}</td>
                      <td className="px-5 py-2 text-right">{z.count}</td>
                      <td className="px-5 py-2 text-right">{formatMoney(z.unit)}</td>
                      <td className="px-5 py-2 text-right font-medium">{formatMoney(z.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold">Adicionales</h2>
            </div>
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {s.additionals.map((a) => (
                  <tr key={a.concept}>
                    <td className="px-5 py-2">{a.concept}</td>
                    <td className="px-5 py-2 text-right">{a.quantity}</td>
                    <td className="px-5 py-2 text-right">{formatMoney(a.unit)}</td>
                    <td className="px-5 py-2 text-right font-medium">{formatMoney(a.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
            En la versión real, debajo de este resumen aparece el detalle envío por envío
            (fecha, ID, cuenta, localidad, zona, estado, repartidor, intentos, tarifa,
            total y motivo si no fue cobrado), los ajustes manuales auditados, las
            validaciones bloqueantes y la exportación a CSV/Excel/PDF.
          </p>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Resumen consolidado por zona</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {s.zoneTotals.map((z) => (
                  <tr key={z.zone}>
                    <td className="py-1.5">{z.zone}</td>
                    <td className="py-1.5 text-right">{z.count}</td>
                    <td className="py-1.5 text-right font-medium">{formatMoney(z.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Mensaje para WhatsApp</h2>
            <WhatsAppBox message={demoWhatsApp} />
          </section>
        </div>
      </div>
    </div>
  );
}
