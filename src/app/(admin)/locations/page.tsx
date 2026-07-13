import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { findUnclassifiedCities } from "@/lib/billing/location-service";
import {
  AddAliasInline,
  AssignZoneInline,
  CreateLocationForm,
} from "@/components/billing/location-forms";
import { AlertTriangle } from "lucide-react";

export const metadata = { title: "Localidades" };

export default async function LocationsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: locations }, { data: zones }, unclassified] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, province, district, zip, zone_id, status, zones(name, color), location_aliases(id, alias)")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("zones")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("priority"),
    findUnclassifiedCities(orgId),
  ]);

  const zoneList = zones ?? [];
  const withoutZone = (locations ?? []).filter((l) => !l.zone_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Localidades</h1>
        <p className="text-sm text-slate-500">
          Cada localidad pertenece a una zona; los envíos se clasifican automáticamente y de
          la zona sale la tarifa. Los alias resuelven variantes de escritura de Mercado
          Libre.
        </p>
      </div>

      {unclassified.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 font-medium text-orange-800">
            <AlertTriangle className="h-4 w-4" />
            Localidades sin clasificar detectadas en envíos
          </div>
          <p className="mt-1 text-sm text-orange-700">
            Estos envíos no reciben precio hasta que crees la localidad (o un alias) con su
            zona. Al crearla, la regla se reutiliza automáticamente.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unclassified.slice(0, 20).map((u) => (
              <li
                key={u.city}
                className="rounded-full bg-white px-3 py-1 text-sm text-orange-800 ring-1 ring-orange-200"
              >
                {u.city} · {u.count} envío{u.count === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {withoutZone.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {withoutZone.length} localidad(es) creadas sin zona asignada: no generan precio
          hasta asignarles una.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Localidad</th>
              <th className="px-4 py-3">Provincia / Partido</th>
              <th className="px-4 py-3">CP</th>
              <th className="px-4 py-3">Alias</th>
              <th className="px-4 py-3">Zona</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(locations ?? []).map((l) => {
              const zone = l.zones as unknown as { name: string; color: string } | null;
              const aliases = (l.location_aliases ?? []) as Array<{ id: string; alias: string }>;
              void zone;
              return (
                <tr key={l.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{l.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[l.province, l.district].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{l.zip ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {aliases.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {a.alias}
                        </span>
                      ))}
                      <AddAliasInline locationId={l.id} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AssignZoneInline
                      locationId={l.id}
                      currentZoneId={l.zone_id}
                      zones={zoneList}
                    />
                  </td>
                </tr>
              );
            })}
            {(locations ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay localidades configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Nueva localidad</h2>
        <CreateLocationForm zones={zoneList} defaultName={unclassified[0]?.city} />
      </section>
    </div>
  );
}
