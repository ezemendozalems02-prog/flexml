import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, ExternalStatusBadge, FlexBadge } from "@/components/ui/badge";
import { AssignDriverForm, SetZoneForm } from "@/components/shipments/operations-forms";
import { internalStatusLabel } from "@/lib/domain/statuses";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Detalle de envío" };

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

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("shipments")
    .select(
      `*, clients(name), zones(id, name, color), drivers(id, first_name, last_name),
       shipment_addresses(*),
       marketplace_connections(nickname, is_mock)`
    )
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!s) notFound();

  const [{ data: events }, { data: attempts }, { data: drivers }, { data: zones }, { data: items }] =
    await Promise.all([
      supabase
        .from("shipment_events")
        .select("*, platform_users(full_name), drivers(first_name, last_name)")
        .eq("shipment_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("shipment_attempts")
        .select("*, incident_reasons(label)")
        .eq("shipment_id", id)
        .order("attempt_number"),
      supabase
        .from("drivers")
        .select("id, first_name, last_name")
        .eq("organization_id", session.organization.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name"),
      supabase
        .from("zones")
        .select("id, name")
        .eq("organization_id", session.organization.id)
        .is("deleted_at", null)
        .order("name"),
      s.order_id
        ? supabase.from("order_items").select("*").eq("order_id", s.order_id)
        : Promise.resolve({ data: [] }),
    ]);

  const addr = s.shipment_addresses as unknown as {
    receiver_name: string | null;
    street: string | null;
    street_number: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    reference: string | null;
    phone: string | null;
  } | null;
  const conn = s.marketplace_connections as unknown as { nickname: string | null; is_mock: boolean } | null;
  const driver = s.drivers as unknown as { id: string; first_name: string; last_name: string } | null;
  const zone = s.zones as unknown as { id: string; name: string; color: string } | null;

  const maskedPhone = addr?.phone
    ? addr.phone.replace(/\d(?=\d{3})/g, "•")
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/shipments" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">
              Envío #{s.external_shipment_id ?? s.id.slice(0, 8)}
            </h1>
            <StatusBadge status={s.internal_status} />
            <ExternalStatusBadge status={s.external_status} />
            <FlexBadge isFlex={s.is_flex} />
            {conn?.is_mock && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                Dato simulado
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {(s.clients as unknown as { name: string } | null)?.name ?? "Sin cliente"} · Cuenta:{" "}
            {conn?.nickname ?? "No disponible"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Resumen</h2>
            <Row label="Productos" value={s.title_summary} />
            <Row label="ID de orden" value={s.external_order_id} />
            <Row label="Fecha de venta" value={s.sold_at ? new Date(s.sold_at).toLocaleString("es-AR") : null} />
            <Row label="Fecha prometida" value={s.promised_date} />
            <Row label="Tipo logístico (ML)" value={s.logistic_type} />
            <Row label="Modo (ML)" value={s.shipping_mode} />
            <Row
              label="Clasificación Flex"
              value={s.flex_reason ? `${s.flex_reason} (regla ${s.flex_rule_version})` : null}
            />
            <Row label="Intentos" value={String(s.attempt_count)} />
            <Row
              label="Entregado"
              value={s.delivered_at ? new Date(s.delivered_at).toLocaleString("es-AR") : null}
            />
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Destino</h2>
            <Row label="Destinatario" value={addr?.receiver_name} />
            <Row
              label="Dirección"
              value={addr?.street ? `${addr.street} ${addr.street_number ?? ""}`.trim() : null}
            />
            <Row label="Referencia" value={addr?.reference} />
            <Row label="Localidad" value={addr?.city} />
            <Row label="Provincia" value={addr?.province} />
            <Row label="Código postal" value={addr?.zip} />
            <Row label="Teléfono" value={maskedPhone} />
          </section>

          {(items ?? []).length > 0 && (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-semibold">Productos</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {(items ?? []).map((it: { id: string; title: string | null; sku: string | null; quantity: number }) => (
                  <li key={it.id} className="flex justify-between py-2">
                    <span>
                      {it.quantity}× {it.title ?? "Sin título"}
                    </span>
                    <span className="text-slate-500">{it.sku ?? ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(attempts ?? []).length > 0 && (
            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-semibold">Intentos de entrega</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {(attempts ?? []).map((a) => (
                  <li key={a.id} className="py-2">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        Intento {a.attempt_number} — {a.outcome}
                        {a.incident_reasons
                          ? ` (${(a.incident_reasons as unknown as { label: string }).label})`
                          : ""}
                      </span>
                      <span className="text-slate-500">
                        {new Date(a.attempted_at).toLocaleString("es-AR")}
                      </span>
                    </div>
                    {a.note && <p className="text-slate-600">{a.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Historial</h2>
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Sin eventos registrados.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-4 text-sm">
                {(events ?? []).map((e) => (
                  <li key={e.id}>
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                    <p className="font-medium text-slate-800">
                      {e.event_type}
                      {e.new_internal_status
                        ? ` → ${internalStatusLabel(e.new_internal_status)}`
                        : ""}
                      {e.new_external_status && !e.new_internal_status
                        ? ` → ${e.new_external_status}`
                        : ""}
                    </p>
                    {e.note && <p className="text-slate-600">{e.note}</p>}
                    <p className="text-xs text-slate-400">
                      {new Date(e.created_at).toLocaleString("es-AR")} · fuente: {e.source}
                      {(e.platform_users as unknown as { full_name: string | null } | null)?.full_name
                        ? ` · ${(e.platform_users as unknown as { full_name: string }).full_name}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Repartidor</h2>
            <p className="mb-3 text-sm text-slate-600">
              {driver ? `Asignado a ${driver.first_name} ${driver.last_name}` : "Sin asignar"}
            </p>
            <AssignDriverForm
              shipmentId={s.id}
              currentDriverId={driver?.id ?? null}
              drivers={drivers ?? []}
            />
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Zona</h2>
            <p className="mb-3 text-sm text-slate-600">
              {zone ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                  {zone.name}
                  {s.zone_method ? ` · método: ${s.zone_method}` : ""}
                </span>
              ) : (
                "Sin zona"
              )}
            </p>
            <SetZoneForm shipmentId={s.id} currentZoneId={zone?.id ?? null} zones={zones ?? []} />
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold">Sincronización</h2>
            <Row
              label="Última sync"
              value={s.last_synced_at ? new Date(s.last_synced_at).toLocaleString("es-AR") : null}
            />
            <Row label="Fuente del último cambio" value={s.last_change_source} />
            <Row label="Subestado ML" value={s.external_substatus} />
            <Row
              label="Actualizado en ML"
              value={
                s.external_updated_at
                  ? new Date(s.external_updated_at).toLocaleString("es-AR")
                  : null
              }
            />
            <Row label="Requiere revisión" value={s.requires_review ? "Sí" : "No"} />
            <Row label="Datos incompletos" value={s.data_incomplete ? "Sí" : "No"} />
          </section>
        </div>
      </div>
    </div>
  );
}
