import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { LabelButtons, CopyId } from "@/components/labels/label-actions";
import { Search } from "lucide-react";

export const metadata = { title: "Mis envíos" };

const PAGE_SIZE = 20;

type SearchParams = Promise<{ q?: string; f?: string; page?: string }>;

/**
 * Dashboard del vendedor (§17): buscador grande, envíos recientes, etiquetas.
 * SIN importes: este portal nunca muestra tarifas ni totales.
 */
export default async function SellerHomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const page = Math.max(1, Number(params.page) || 1);

  // El rol client queda acotado a su comercio; owner/admin pueden previsualizar todo
  const clientId = session.membership.client_id;
  const isSellerRole = session.membership.role === "client";
  if (isSellerRole && !clientId) {
    return (
      <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        Tu usuario todavía no está vinculado a un comercio. Pedile al administrador de la
        transportista que lo vincule.
      </p>
    );
  }

  const base = () => {
    let q = supabase
      .from("shipments")
      .select("id, internal_status", { count: "exact", head: true })
      .eq("organization_id", session.organization.id);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  };
  const countOf = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [today, pending, inDelivery, delivered, cancelled, rescheduled] = await Promise.all([
    countOf(base().gte("created_at", todayStart.toISOString())),
    countOf(base().in("internal_status", ["imported", "pending_classification", "pending_pickup", "classified", "assigned"])),
    countOf(base().eq("internal_status", "out_for_delivery")),
    countOf(base().eq("internal_status", "delivered")),
    countOf(base().in("internal_status", ["cancelled_by_ml", "cancelled_by_client"])),
    countOf(base().eq("internal_status", "rescheduled")),
  ]);

  let query = supabase
    .from("shipments")
    .select(
      `id, external_shipment_id, external_order_id, title_summary, internal_status,
       sold_at, promised_date,
       zones(name, color), shipment_addresses(city, zip),
       shipping_labels(internal_status)`,
      { count: "exact" }
    )
    .eq("organization_id", session.organization.id);
  if (clientId) query = query.eq("client_id", clientId);

  if (params.q) {
    query = query.or(
      `external_shipment_id.ilike.%${params.q}%,external_order_id.ilike.%${params.q}%,pack_id.ilike.%${params.q}%,title_summary.ilike.%${params.q}%`
    );
  }
  if (params.f === "cancelled") {
    query = query.in("internal_status", ["cancelled_by_ml", "cancelled_by_client"]);
  }
  if (params.f === "rescheduled") query = query.eq("internal_status", "rescheduled");

  const from = (page - 1) * PAGE_SIZE;
  const { data: shipments, count } = await query
    .order("sold_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const stats = [
    { label: "Hoy", value: today },
    { label: "Pendientes", value: pending },
    { label: "En reparto", value: inDelivery },
    { label: "Entregados", value: delivered },
    { label: "Cancelados", value: cancelled, href: "?f=cancelled" },
    { label: "Reprogramados", value: rescheduled, href: "?f=rescheduled" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis envíos Flex</h1>
        <p className="text-sm text-slate-500">
          Buscá una venta, mirá el estado y descargá o imprimí la etiqueta sin depender de
          nadie.
        </p>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar por ID de venta, ID de envío o producto…"
            className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button className="rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-700">
          Buscar
        </button>
      </form>

      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {stats.map(({ label, value, href }) => (
          <Link
            key={label}
            href={href ?? "/seller"}
            className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
          >
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {(shipments ?? []).map((s) => {
          const zone = s.zones as unknown as { name: string; color: string } | null;
          const addr = s.shipment_addresses as unknown as { city: string | null; zip: string | null } | null;
          return (
            <div key={s.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/seller/shipment/${s.id}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      Venta {s.external_order_id ?? "—"}
                    </Link>
                    <StatusBadge status={s.internal_status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-600">{s.title_summary ?? ""}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    <CopyId value={s.external_shipment_id ?? "—"} label="ID de envío" /> ·{" "}
                    {addr?.city ?? "Localidad no disponible"}
                    {zone ? (
                      <span className="ml-1 inline-flex items-center gap-1">
                        · <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />
                        {zone.name}
                      </span>
                    ) : null}
                  </p>
                </div>
                <LabelButtons shipmentId={s.id} compact />
              </div>
            </div>
          );
        })}
        {(shipments ?? []).length === 0 && (
          <p className="rounded-xl bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            {params.q
              ? "No encontramos envíos con esa búsqueda."
              : "Todavía no hay envíos sincronizados para tu comercio."}
          </p>
        )}
      </div>

      {(count ?? 0) > PAGE_SIZE && (
        <div className="flex justify-between text-sm text-slate-600">
          <span>
            Página {page} de {Math.ceil((count ?? 0) / PAGE_SIZE)}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?q=${params.q ?? ""}&page=${page - 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
                Anterior
              </Link>
            )}
            {from + PAGE_SIZE < (count ?? 0) && (
              <Link href={`?q=${params.q ?? ""}&page=${page + 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
