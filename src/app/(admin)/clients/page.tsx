import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CreateClientForm } from "@/components/clients/create-client-form";
import Link from "next/link";

export const metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact_name, email, phone, pickup_city, status, marketplace_connections(id, nickname, status)")
    .eq("organization_id", session.organization.id)
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <p className="text-sm text-slate-500">
          Comercios de Mercado Libre para los que repartís envíos Flex.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Comercio</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Localidad</th>
              <th className="px-4 py-3">Cuentas ML</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(clients ?? []).map((c) => {
              const conns = (c.marketplace_connections ?? []) as Array<{
                id: string;
                nickname: string | null;
                status: string;
              }>;
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.contact_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.email ?? c.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.pickup_city ?? "—"}</td>
                  <td className="px-4 py-3">
                    {conns.length === 0 ? (
                      <Link
                        href={`/api/oauth/mercadolibre/start?clientId=${c.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Conectar Mercado Libre
                      </Link>
                    ) : (
                      <span className="text-slate-700">
                        {conns.map((cn) => cn.nickname ?? cn.id.slice(0, 6)).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(clients ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay clientes. Creá el primero acá abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Nuevo cliente</h2>
        <CreateClientForm />
      </section>
    </div>
  );
}
