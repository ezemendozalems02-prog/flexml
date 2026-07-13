import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { LabelButtons, CopyId } from "@/components/labels/label-actions";
import { LABEL_STATUS_LABEL } from "@/lib/labels/issue-types";
import { StatusBadge } from "@/components/ui/badge";
import Link from "next/link";
import { Search } from "lucide-react";

export const metadata = { title: "Etiquetas Flex" };

const PAGE_SIZE = 25;

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function LabelsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requirePermission("labels.view");
  const supabase = await createClient();
  const page = Math.max(1, Number(params.page) || 1);

  let query = supabase
    .from("shipments")
    .select(
      `id, external_shipment_id, external_order_id, pack_id, sold_at, internal_status,
       package_count, clients(name), marketplace_connections(nickname),
       zones(name, color), drivers(first_name, last_name),
       shipment_addresses(receiver_name, city, zip),
       shipping_labels(id, internal_status, version, download_count, generated_at, last_downloaded_at)`,
      { count: "exact" }
    )
    .eq("organization_id", session.organization.id)
    .eq("is_flex", true);

  if (params.q) {
    query = query.or(
      `external_shipment_id.ilike.%${params.q}%,external_order_id.ilike.%${params.q}%,pack_id.ilike.%${params.q}%,title_summary.ilike.%${params.q}%`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: shipments, count } = await query
    .order("sold_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Etiquetas Flex</h1>
        <p className="text-sm text-slate-500">
          Consultá, descargá o imprimí etiquetas de los envíos sincronizados. Cada acceso
          queda auditado. La disponibilidad depende de lo que Mercado Libre habilite por
          API.
        </p>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar por ID de venta, ID de envío, pack o producto…"
            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <button className="rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-700">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Venta / Envío</th>
              <th className="px-4 py-3">Cliente / Cuenta</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Estado envío</th>
              <th className="px-4 py-3">Etiqueta</th>
              <th className="px-4 py-3">Descargas</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(shipments ?? []).map((s) => {
              const label = (
                Array.isArray(s.shipping_labels) ? s.shipping_labels[0] : s.shipping_labels
              ) as unknown as {
                internal_status: string;
                version: number;
                download_count: number;
                generated_at: string | null;
              } | null;
              const zone = s.zones as unknown as { name: string; color: string } | null;
              const addr = s.shipment_addresses as unknown as { city: string | null; zip: string | null } | null;
              const st = label ? LABEL_STATUS_LABEL[label.internal_status] : null;
              return (
                <tr key={s.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <CopyId value={s.external_order_id ?? "—"} label="ID de venta" />
                      <CopyId value={s.external_shipment_id ?? "—"} label="ID de envío" />
                      <span className="text-xs text-slate-400">
                        {s.sold_at ? new Date(s.sold_at).toLocaleDateString("es-AR") : ""}
                        {s.package_count > 1 ? ` · ${s.package_count} paquetes` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800">{(s.clients as unknown as { name: string } | null)?.name ?? "—"}</p>
                    <p className="text-xs text-slate-400">
                      {(s.marketplace_connections as unknown as { nickname: string | null } | null)?.nickname ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {addr?.city ?? "No disponible"}
                    {addr?.zip ? ` (${addr.zip})` : ""}
                  </td>
                  <td className="px-4 py-3">
                    {zone ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                        {zone.name}
                      </span>
                    ) : (
                      <span className="text-orange-600">Sin zona</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.internal_status} />
                  </td>
                  <td className="px-4 py-3">
                    {st ? (
                      <div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                          {st.label}
                        </span>
                        <p className="mt-0.5 text-xs text-slate-400">
                          v{label!.version}
                          {label!.generated_at
                            ? ` · ${new Date(label!.generated_at).toLocaleDateString("es-AR")}`
                            : ""}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Aún no consultada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {label?.download_count ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <LabelButtons shipmentId={s.id} compact />
                  </td>
                </tr>
              );
            })}
            {(shipments ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No hay envíos Flex sincronizados{params.q ? " con esa búsqueda" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {page} de {totalPages} · {total} envíos Flex
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?q=${params.q ?? ""}&page=${page - 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?q=${params.q ?? ""}&page=${page + 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
