import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateDriverForm } from "@/components/drivers/create-driver-form";

export const metadata = { title: "Repartidores" };

const DRIVER_STATUS: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  suspended: "Suspendido",
  on_vacation: "De vacaciones",
  unavailable: "No disponible",
  on_route: "En reparto",
};

export default async function DriversPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, first_name, last_name, phone, email, status, national_id")
    .eq("organization_id", session.organization.id)
    .is("deleted_at", null)
    .order("first_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repartidores</h1>
        <p className="text-sm text-slate-500">
          Equipo de reparto. Cada repartidor puede tener un usuario para la app móvil.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(drivers ?? []).map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {d.first_name} {d.last_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{d.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{d.national_id ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {DRIVER_STATUS[d.status] ?? d.status}
                  </span>
                </td>
              </tr>
            ))}
            {(drivers ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay repartidores.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Nuevo repartidor</h2>
        <CreateDriverForm />
      </section>
    </div>
  );
}
