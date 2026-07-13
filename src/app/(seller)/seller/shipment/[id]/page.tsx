import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, ExternalStatusBadge } from "@/components/ui/badge";
import { LabelButtons, CopyId, ReportIssueForm } from "@/components/labels/label-actions";
import { LABEL_STATUS_LABEL } from "@/lib/labels/issue-types";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Detalle del envío" };

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

/** Vista de detalle para el vendedor (§7): envío + etiqueta. SIN importes. */
export default async function SellerShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("shipments")
    .select(
      `id, external_shipment_id, external_order_id, title_summary, internal_status,
       external_status, external_substatus, sold_at, promised_date, attempt_count,
       package_count, client_id,
       marketplace_connections(nickname), zones(name, color),
       shipment_addresses(receiver_name, street, street_number, city, province, zip),
       shipping_labels(id, internal_status, format, version, generated_at)`
    )
    .eq("id", id)
    .eq("organization_id", session.organization.id);

  // El vendedor solo ve envíos de su comercio (además de la RLS)
  if (session.membership.role === "client") {
    if (!session.membership.client_id) notFound();
    query = query.eq("client_id", session.membership.client_id);
  }

  const { data: s } = await query.maybeSingle();
  if (!s) notFound();

  const addr = s.shipment_addresses as unknown as {
    receiver_name: string | null;
    street: string | null;
    street_number: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
  } | null;
  const zone = s.zones as unknown as { name: string; color: string } | null;
  const label = (
    Array.isArray(s.shipping_labels) ? s.shipping_labels[0] : s.shipping_labels
  ) as unknown as {
    internal_status: string;
    format: string | null;
    version: number;
    generated_at: string | null;
  } | null;
  const labelStatus = label ? LABEL_STATUS_LABEL[label.internal_status] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/seller" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">
              Venta {s.external_order_id ?? "—"}
            </h1>
            <StatusBadge status={s.internal_status} />
            <ExternalStatusBadge status={s.external_status} />
          </div>
          <p className="text-sm text-slate-500">
            Cuenta:{" "}
            {(s.marketplace_connections as unknown as { nickname: string | null } | null)
              ?.nickname ?? "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 font-semibold">Datos del envío</h2>
          <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
            <span className="text-sm text-slate-500">
              ID de venta: <CopyId value={s.external_order_id ?? "—"} label="ID de venta" />
            </span>
            <span className="text-sm text-slate-500">
              ID de envío: <CopyId value={s.external_shipment_id ?? "—"} label="ID de envío" />
            </span>
          </div>
          <Row label="Producto" value={s.title_summary} />
          <Row
            label="Fecha de venta"
            value={s.sold_at ? new Date(s.sold_at).toLocaleString("es-AR") : null}
          />
          <Row label="Fecha prometida" value={s.promised_date} />
          <Row label="Destinatario" value={addr?.receiver_name} />
          <Row
            label="Dirección"
            value={addr?.street ? `${addr.street} ${addr.street_number ?? ""}`.trim() : null}
          />
          <Row label="Localidad" value={addr?.city} />
          <Row label="Código postal" value={addr?.zip} />
          <Row
            label="Zona operativa"
            value={
              zone ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                  {zone.name}
                </span>
              ) : null
            }
          />
          <Row label="Subestado (ML)" value={s.external_substatus} />
          <Row label="Paquetes" value={String(s.package_count)} />
          <Row label="Intentos de entrega" value={String(s.attempt_count)} />
        </section>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Etiqueta Flex</h2>
            {labelStatus && (
              <p className="mb-3 text-sm text-slate-600">
                Estado:{" "}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${labelStatus.className}`}>
                  {labelStatus.label}
                </span>
                {label?.format ? ` · Formato: ${label.format.toUpperCase()}` : ""}
                {label?.version ? ` · Versión ${label.version}` : ""}
                {label?.generated_at
                  ? ` · Obtenida el ${new Date(label.generated_at).toLocaleDateString("es-AR")}`
                  : ""}
              </p>
            )}
            <LabelButtons shipmentId={s.id} />
            <p className="mt-3 text-xs text-slate-400">
              La etiqueta se pide a Mercado Libre por la conexión oficial de tu cuenta. Si
              la API no la entrega (cancelada, vencida o sin permiso), te lo vamos a
              indicar acá.
            </p>
          </section>

          <ReportIssueForm shipmentId={s.id} />
        </div>
      </div>
    </div>
  );
}
