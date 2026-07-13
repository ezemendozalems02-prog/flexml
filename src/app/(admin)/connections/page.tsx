import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plug, RefreshCw } from "lucide-react";

export const metadata = { title: "Cuentas Mercado Libre" };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  connecting: { label: "Conectando", className: "bg-slate-100 text-slate-700" },
  active: { label: "Activa", className: "bg-emerald-50 text-emerald-700" },
  syncing: { label: "Sincronizando", className: "bg-blue-50 text-blue-700" },
  error: { label: "Con error", className: "bg-orange-50 text-orange-700" },
  token_expired: { label: "Token vencido", className: "bg-orange-50 text-orange-700" },
  auth_revoked: { label: "Autorización revocada", className: "bg-red-50 text-red-700" },
  disconnected: { label: "Desconectada", className: "bg-slate-100 text-slate-500" },
  needs_reauth: { label: "Requiere reconexión", className: "bg-red-50 text-red-700" },
};

type SearchParams = Promise<{ connected?: string; error?: string }>;

export default async function ConnectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: connections } = await supabase
    .from("marketplace_connections")
    .select(
      "id, nickname, site_id, status, is_mock, last_successful_sync_at, last_error, consecutive_errors, token_expires_at, clients(id, name)"
    )
    .eq("organization_id", session.organization.id)
    .order("created_at", { ascending: false });

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("organization_id", session.organization.id)
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cuentas de Mercado Libre</h1>
        <p className="text-sm text-slate-500">
          La conexión se hace por OAuth: el comercio autoriza el acceso sin compartir su
          contraseña. Los tokens se guardan cifrados y solo se usan desde el servidor.
        </p>
      </div>

      {params.connected && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          Cuenta <strong>{params.connected}</strong> conectada correctamente. La primera
          sincronización ya se disparó.
        </p>
      )}
      {params.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudo completar la conexión ({params.error}). Intentá de nuevo.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(connections ?? []).map((c) => {
          const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.connecting;
          const client = c.clients as unknown as { id: string; name: string } | null;
          return (
            <div key={c.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    {c.nickname ?? "Cuenta sin nombre"}
                    {c.is_mock && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                        Simulada
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">
                    Cliente: {client?.name ?? "—"} · Site: {c.site_id ?? "—"}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>
                  {st.label}
                </span>
              </div>
              <dl className="mt-4 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Última sincronización exitosa</dt>
                  <dd>
                    {c.last_successful_sync_at
                      ? new Date(c.last_successful_sync_at).toLocaleString("es-AR")
                      : "Nunca"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Token vence</dt>
                  <dd>
                    {c.token_expires_at
                      ? new Date(c.token_expires_at).toLocaleString("es-AR")
                      : "—"}
                  </dd>
                </div>
                {c.last_error && (
                  <div className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-700">
                    {c.last_error.slice(0, 160)} ({c.consecutive_errors} errores seguidos)
                  </div>
                )}
              </dl>
              {["needs_reauth", "auth_revoked", "token_expired", "error"].includes(c.status) &&
                client && (
                  <Link
                    href={`/api/oauth/mercadolibre/start?clientId=${client.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reconectar
                  </Link>
                )}
            </div>
          );
        })}
      </div>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4" /> Conectar nueva cuenta
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Elegí el cliente dueño de la cuenta. Se abre la autorización oficial de Mercado
          Libre.
        </p>
        {(clients ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">
            Primero creá un cliente en{" "}
            <Link href="/clients" className="font-medium text-blue-600 hover:underline">
              Clientes
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(clients ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/api/oauth/mercadolibre/start?clientId=${c.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  <Plug className="h-4 w-4" />
                  Conectar cuenta de {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
