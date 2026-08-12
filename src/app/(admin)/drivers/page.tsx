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

type Summary = {
  pendiente: number;
  retirado: number;
  enReparto: number;
  entregadoHoy: number;
  reprogramado: number;
  incidencia: number;
  total: number;
};

const PICKED = new Set(["picked_up", "at_warehouse"]);
const IN_ROUTE = new Set(["route_prep", "out_for_delivery", "visited"]);
const INCIDENT = new Set([
  "not_answered",
  "absent",
  "wrong_address",
  "incomplete_address",
  "dangerous_zone",
  "rejected",
  "partial_delivery",
  "under_review",
  "pending_return",
]);

function emptySummary(): Summary {
  return { pendiente: 0, retirado: 0, enReparto: 0, entregadoHoy: 0, reprogramado: 0, incidencia: 0, total: 0 };
}

export default async function DriversPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: drivers } = await supabase
    .from("drivers")
    .select("id, first_name, last_name, phone, email, status, national_id")
    .eq("organization_id", session.organization.id)
    .is("deleted_at", null)
    .order("first_name");

  // Resumen operativo por repartidor (ventana de 60 días para no arrastrar
  // todo el historial; el detalle completo vive en /shipments e Historial).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const todayKey = new Date().toDateString();

  const { data: workload } = await supabase
    .from("shipments")
    .select("driver_id, internal_status, delivered_at")
    .eq("organization_id", session.organization.id)
    .not("driver_id", "is", null)
    .gte("created_at", cutoff.toISOString());

  const summary = new Map<string, Summary>();
  for (const d of drivers ?? []) summary.set(d.id, emptySummary());
  for (const r of workload ?? []) {
    const bucket = summary.get(r.driver_id as string);
    if (!bucket) continue; // repartidor inactivo/eliminado: no se muestra en la tabla
    bucket.total++;
    if (r.internal_status === "delivered") {
      if (r.delivered_at && new Date(r.delivered_at).toDateString() === todayKey) bucket.entregadoHoy++;
    } else if (r.internal_status === "rescheduled") {
      bucket.reprogramado++;
    } else if (PICKED.has(r.internal_status)) {
      bucket.retirado++;
    } else if (IN_ROUTE.has(r.internal_status)) {
      bucket.enReparto++;
    } else if (r.internal_status === "assigned") {
      bucket.pendiente++;
    } else if (INCIDENT.has(r.internal_status)) {
      bucket.incidencia++;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repartidores</h1>
        <p className="text-sm text-slate-500">
          Equipo de reparto. Cada repartidor puede tener un usuario para la app móvil.
        </p>
      </div>

      {(drivers ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Repartidor</th>
                <th className="px-4 py-3 text-center">Pendientes</th>
                <th className="px-4 py-3 text-center">Retirados</th>
                <th className="px-4 py-3 text-center">En reparto</th>
                <th className="px-4 py-3 text-center">Entregados hoy</th>
                <th className="px-4 py-3 text-center">Reprogramados</th>
                <th className="px-4 py-3 text-center">Incidencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(drivers ?? []).map((d) => {
                const b = summary.get(d.id) ?? emptySummary();
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.first_name} {d.last_name}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{b.pendiente}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{b.retirado}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{b.enReparto}</td>
                    <td className="px-4 py-3 text-center font-medium text-emerald-700">{b.entregadoHoy}</td>
                    <td className="px-4 py-3 text-center text-amber-700">{b.reprogramado}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{b.incidencia}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Resumen de los últimos 60 días de envíos con repartidor asignado.
          </p>
        </div>
      )}

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
