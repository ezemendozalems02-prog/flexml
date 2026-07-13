import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Perfil" };

export default async function DriverProfilePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: driver } = session.membership.driver_id
    ? await supabase
        .from("drivers")
        .select("first_name, last_name, phone, email, status, vehicle_id")
        .eq("id", session.membership.driver_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Perfil</h1>
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Nombre</dt>
            <dd className="font-medium">
              {driver ? `${driver.first_name} ${driver.last_name}` : session.fullName ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Correo</dt>
            <dd className="font-medium">{session.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Teléfono</dt>
            <dd className="font-medium">{driver?.phone ?? "No disponible"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Empresa</dt>
            <dd className="font-medium">{session.organization.name}</dd>
          </div>
        </dl>
      </div>
      <p className="text-center text-xs text-slate-400">
        Instalá esta app desde el menú del navegador: “Agregar a pantalla de inicio”.
      </p>
    </div>
  );
}
