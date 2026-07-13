import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateZoneForm } from "@/components/zones/create-zone-form";

export const metadata = { title: "Zonas" };

export default async function ZonesPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, color, priority, status, zone_rules(rule_type, value)")
    .eq("organization_id", session.organization.id)
    .is("deleted_at", null)
    .order("priority");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zonas</h1>
        <p className="text-sm text-slate-500">
          Los envíos se clasifican automáticamente por código postal y localidad. Podés
          corregir la zona de cualquier envío desde su detalle.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(zones ?? []).map((z) => {
          const rules = (z.zone_rules ?? []) as Array<{ rule_type: string; value: string | null }>;
          const zips = rules.filter((r) => r.rule_type === "zip").map((r) => r.value);
          const cities = rules.filter((r) => r.rule_type === "city").map((r) => r.value);
          return (
            <div key={z.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: z.color }} />
                <h2 className="font-semibold text-slate-900">{z.name}</h2>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-slate-600">
                {zips.length > 0 && (
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Códigos postales</dt>
                    <dd>{zips.join(", ")}</dd>
                  </div>
                )}
                {cities.length > 0 && (
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Localidades</dt>
                    <dd>{cities.join(", ")}</dd>
                  </div>
                )}
                {rules.length === 0 && <p className="text-slate-400">Sin reglas todavía</p>}
              </dl>
            </div>
          );
        })}
        {(zones ?? []).length === 0 && (
          <p className="text-sm text-slate-500 md:col-span-3">
            Todavía no hay zonas. Creá la primera acá abajo — los próximos envíos se
            clasificarán automáticamente.
          </p>
        )}
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Nueva zona</h2>
        <CreateZoneForm />
      </section>
    </div>
  );
}
