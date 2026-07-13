import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { DeliveryActions } from "@/components/driver/delivery-actions";
import { LabelButtons } from "@/components/labels/label-actions";
import { ArrowLeft, MapPin, Navigation, Tag } from "lucide-react";

export const metadata = { title: "Entrega" };

const FINAL_STATUSES = [
  "delivered",
  "cancelled_by_ml",
  "cancelled_by_client",
  "returned",
  "returned_to_seller",
];

export default async function DriverShipmentPage({
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
      "id, external_shipment_id, title_summary, internal_status, attempt_count, driver_id, package_count, shipment_addresses(*), clients(name)"
    )
    .eq("id", id)
    .eq("organization_id", session.organization.id);

  // Un repartidor solo ve sus envíos asignados
  if (session.membership.role === "driver") {
    if (!session.membership.driver_id) notFound();
    query = query.eq("driver_id", session.membership.driver_id);
  }

  const { data: s } = await query.maybeSingle();
  if (!s) notFound();

  const { data: reasons } = await supabase
    .from("incident_reasons")
    .select("id, label, requires_note, allows_reschedule")
    .eq("active", true)
    .eq("visible_to_driver", true)
    .or(`organization_id.is.null,organization_id.eq.${session.organization.id}`)
    .order("sort_order");

  const addr = s.shipment_addresses as unknown as {
    receiver_name: string | null;
    street: string | null;
    street_number: string | null;
    reference: string | null;
    city: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  } | null;

  const fullAddress = addr?.street
    ? `${addr.street} ${addr.street_number ?? ""}, ${addr.city ?? ""}`.trim()
    : null;
  const mapsHref = addr?.lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${addr.lat},${addr.lng}`
    : fullAddress
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
      : null;

  const isFinal = FINAL_STATUSES.includes(s.internal_status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/driver" className="rounded-lg p-2 text-slate-500 active:bg-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-bold">#{s.external_shipment_id ?? s.id.slice(0, 8)}</h1>
          <StatusBadge status={s.internal_status} />
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {fullAddress ?? "Dirección no disponible"}
            </p>
            {addr?.reference && <p className="text-sm text-slate-600">Ref: {addr.reference}</p>}
            {addr?.zip && <p className="text-sm text-slate-500">CP {addr.zip}</p>}
            {addr?.receiver_name && (
              <p className="mt-1 text-sm text-slate-700">
                Destinatario: <strong>{addr.receiver_name}</strong>
              </p>
            )}
          </div>
        </div>
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-base font-bold text-white active:bg-blue-700"
          >
            <Navigation className="h-5 w-5" /> Abrir en Google Maps
          </a>
        )}
      </div>

      <div className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
        <p className="font-medium text-slate-900">{s.title_summary ?? "Sin descripción"}</p>
        <p className="mt-1 text-slate-500">
          Cliente: {(s.clients as unknown as { name: string } | null)?.name ?? "—"} · Paquetes:{" "}
          {s.package_count} · Intentos: {s.attempt_count}
        </p>
      </div>

      {isFinal ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          Este envío ya está cerrado ({s.internal_status === "delivered" ? "entregado" : "finalizado"}).
        </p>
      ) : (
        <DeliveryActions shipmentId={s.id} incidentReasons={reasons ?? []} />
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Tag className="h-4 w-4" /> Etiqueta Flex
        </h2>
        <LabelButtons shipmentId={s.id} compact />
      </div>
    </div>
  );
}
