import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, ExternalStatusBadge, FlexBadge } from "@/components/ui/badge";
import { INTERNAL_STATUSES, internalStatusLabel } from "@/lib/domain/statuses";

export const metadata = { title: "Envíos" };

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  status?: string;
  client?: string;
  driver?: string;
  zone?: string;
  flex?: string;
  q?: string;
  page?: string;
}>;

export default async function ShipmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const orgId = session.organization.id;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ data: clients }, { data: drivers }, { data: zones }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", orgId).is("deleted_at", null).order("name"),
    supabase.from("drivers").select("id, first_name, last_name").eq("organization_id", orgId).is("deleted_at", null).order("first_name"),
    supabase.from("zones").select("id, name, color").eq("organization_id", orgId).is("deleted_at", null).order("name"),
  ]);

  let query = supabase
    .from("shipments")
    .select(
      "id, external_shipment_id, external_order_id, title_summary, internal_status, external_status, is_flex, promised_date, attempt_count, created_at, clients(name), zones(name, color), drivers(first_name, last_name), shipment_addresses(city, zip)",
      { count: "exact" }
    )
    .eq("organization_id", orgId);

  if (params.status && (INTERNAL_STATUSES as readonly string[]).includes(params.status)) {
    query = query.eq("internal_status", params.status);
  }
  if (params.client) query = query.eq("client_id", params.client);
  if (params.driver) {
    query = params.driver === "none" ? query.is("driver_id", null) : query.eq("driver_id", params.driver);
  }
  if (params.zone) {
    query = params.zone === "none" ? query.is("zone_id", null) : query.eq("zone_id", params.zone);
  }
  if (params.flex === "1") query = query.eq("is_flex", true);
  if (params.flex === "0") query = query.eq("is_flex", false);
  if (params.q) {
    query = query.or(
      `external_shipment_id.ilike.%${params.q}%,external_order_id.ilike.%${params.q}%,title_summary.ilike.%${params.q}%`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: shipments, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const queryString = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...overrides })) {
      if (v) next.set(k, v);
    }
    return `?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envíos</h1>
          <p className="text-sm text-slate-500">{total} envíos encontrados</p>
        </div>
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-6">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Buscar ID o producto…"
          className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={params.status ?? ""} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">Estado interno</option>
          {INTERNAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {internalStatusLabel(s)}
            </option>
          ))}
        </select>
        <select name="client" defaultValue={params.client ?? ""} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">Cliente</option>
          {(clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="driver" defaultValue={params.driver ?? ""} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">Repartidor</option>
          <option value="none">Sin asignar</option>
          {(drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.first_name} {d.last_name}
            </option>
          ))}
        </select>
        <select name="zone" defaultValue={params.zone ?? ""} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="">Zona</option>
          <option value="none">Sin zona</option>
          {(zones ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex gap-2 md:col-span-6">
          <select name="flex" defaultValue={params.flex ?? ""} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
            <option value="">Flex y no Flex</option>
            <option value="1">Solo Flex</option>
            <option value="0">Solo no Flex</option>
          </select>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Filtrar
          </button>
          <Link
            href="/shipments"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Limpiar
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Envío</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Repartidor</th>
              <th className="px-4 py-3">Flex</th>
              <th className="px-4 py-3">Estado interno</th>
              <th className="px-4 py-3">Estado ML</th>
              <th className="px-4 py-3">Intentos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(shipments ?? []).map((s) => {
              const zone = s.zones as unknown as { name: string; color: string } | null;
              const driver = s.drivers as unknown as { first_name: string; last_name: string } | null;
              const addr = s.shipment_addresses as unknown as { city: string | null; zip: string | null } | null;
              return (
                <tr key={s.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/shipments/${s.id}`} className="font-medium text-blue-700 hover:underline">
                      #{s.external_shipment_id ?? s.id.slice(0, 8)}
                    </Link>
                    <p className="max-w-[220px] truncate text-xs text-slate-500">
                      {s.title_summary ?? "Sin descripción"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {(s.clients as unknown as { name: string } | null)?.name ?? "—"}
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
                  <td className="px-4 py-3 text-slate-700">
                    {driver ? `${driver.first_name} ${driver.last_name}` : <span className="text-slate-400">Sin asignar</span>}
                  </td>
                  <td className="px-4 py-3">
                    <FlexBadge isFlex={s.is_flex} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.internal_status} />
                  </td>
                  <td className="px-4 py-3">
                    <ExternalStatusBadge status={s.external_status} />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{s.attempt_count}</td>
                </tr>
              );
            })}
            {(shipments ?? []).length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  No hay envíos con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={queryString({ page: String(page - 1) })} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={queryString({ page: String(page + 1) })} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-50">
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
