import Link from "next/link";
import { notFound } from "next/navigation";
import { demoShipments, demoEvents } from "@/lib/demo/fixtures";
import { StatusBadge, ExternalStatusBadge, FlexBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/billing/engine";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Detalle de envío (demo)" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">
        {value ?? <span className="font-normal text-slate-400">No disponible</span>}
      </span>
    </div>
  );
}

export default async function DemoShipmentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = demoShipments.find((x) => x.id === id);
  if (!s) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/demo/shipments" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">Envío #{s.external_shipment_id}</h1>
            <StatusBadge status={s.internal_status} />
            <ExternalStatusBadge status={s.external_status} />
            <FlexBadge isFlex={s.is_flex} />
          </div>
          <p className="text-sm text-slate-500">
            {s.client} · Cuenta: {s.account}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Resumen</h2>
            <Row label="Productos" value={s.title_summary} />
            <Row label="ID de orden" value={s.external_order_id} />
            <Row label="Fecha prometida" value={s.promised_date} />
            <Row label="Tipo logístico (ML)" value="self_service" />
            <Row label="Clasificación Flex" value="logistic_type_self_service (regla 2026-07-v1)" />
            <Row label="Intentos" value={String(s.attempt_count)} />
            <Row
              label="Precio congelado"
              value={s.unit_price ? formatMoney(s.unit_price) : "Sin precio (sin zona o no cobrable)"}
            />
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Destino</h2>
            <Row label="Destinatario" value={s.receiver} />
            <Row label="Dirección" value={s.street} />
            <Row label="Localidad" value={s.city} />
            <Row label="Código postal" value={s.zip} />
            <Row label="Teléfono" value="••• ••• 431" />
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Historial</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-4 text-sm">
              {demoEvents.map((e, i) => (
                <li key={i}>
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <p className="font-medium text-slate-800">{e.note}</p>
                  <p className="text-xs text-slate-400">
                    {e.when} · fuente: {e.source}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Operación</h2>
            <Row label="Repartidor" value={s.driver ?? "Sin asignar"} />
            <Row
              label="Zona"
              value={
                s.zone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.zoneColor }} />
                    {s.zone}
                  </span>
                ) : (
                  "Sin zona"
                )
              }
            />
            <Row label="Método de zona" value={s.zone ? "localidad configurada" : null} />
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              En la versión real acá podés reasignar repartidor y corregir la zona; cada
              cambio queda en el historial.
            </p>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Sincronización</h2>
            <Row label="Última sync" value="hoy 09:40" />
            <Row label="Fuente del último cambio" value="mercadolibre" />
            <Row label="Requiere revisión" value={s.internal_status === "absent" ? "Sí" : "No"} />
          </section>
        </div>
      </div>
    </div>
  );
}
