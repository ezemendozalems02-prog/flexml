import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AlertTriangle, Package, PlugZap, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function baseCount(supabase: Supabase, orgId: string) {
  return supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
}

async function resolveCount(q: PromiseLike<{ count: number | null }>) {
  const { count } = await q;
  return count ?? 0;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const orgId = session.organization.id;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, today, delivered, inDelivery, unassigned, noZone, incidents] =
    await Promise.all([
      resolveCount(baseCount(supabase, orgId)),
      resolveCount(baseCount(supabase, orgId).gte("created_at", todayStart.toISOString())),
      resolveCount(baseCount(supabase, orgId).eq("internal_status", "delivered")),
      resolveCount(baseCount(supabase, orgId).eq("internal_status", "out_for_delivery")),
      resolveCount(
        baseCount(supabase, orgId)
          .is("driver_id", null)
          .not(
            "internal_status",
            "in",
            "(delivered,cancelled_by_ml,cancelled_by_client,returned,returned_to_seller)"
          )
      ),
      resolveCount(baseCount(supabase, orgId).is("zone_id", null)),
      resolveCount(baseCount(supabase, orgId).eq("requires_review", true)),
    ]);

  const { data: badConnections } = await supabase
    .from("marketplace_connections")
    .select("id, nickname, status, last_error")
    .eq("organization_id", orgId)
    .in("status", ["error", "token_expired", "auth_revoked", "needs_reauth"]);

  const { data: recent } = await supabase
    .from("shipments")
    .select("id, external_shipment_id, title_summary, internal_status, created_at, clients(name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);

  const effectiveness = total > 0 ? Math.round((delivered / total) * 100) : null;

  const cards = [
    { label: "Envíos totales", value: total, icon: Package },
    { label: "Ingresados hoy", value: today, icon: TrendingUp },
    { label: "En reparto", value: inDelivery, icon: Package },
    { label: "Entregados", value: delivered, icon: Package },
    { label: "Sin repartidor", value: unassigned, icon: AlertTriangle },
    { label: "Sin zona", value: noZone, icon: AlertTriangle },
    { label: "Requieren revisión", value: incidents, icon: AlertTriangle },
    {
      label: "Efectividad",
      value: effectiveness === null ? "—" : `${effectiveness}%`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Resumen operativo de {session.organization.name}</p>
      </div>

      {(badConnections?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 font-medium text-orange-800">
            <PlugZap className="h-4 w-4" />
            Cuentas de Mercado Libre con problemas
          </div>
          <ul className="mt-2 space-y-1 text-sm text-orange-700">
            {badConnections!.map((c) => (
              <li key={c.id}>
                <Link href="/connections" className="underline">
                  {c.nickname ?? c.id}
                </Link>{" "}
                — {c.status}
                {c.last_error ? `: ${c.last_error.slice(0, 120)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Últimos envíos</h2>
          <Link href="/shipments" className="text-sm font-medium text-blue-600 hover:underline">
            Ver todos
          </Link>
        </div>
        {recent && recent.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/shipments/${s.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {s.title_summary ?? "Sin descripción"}
                    </p>
                    <p className="text-xs text-slate-500">
                      #{s.external_shipment_id ?? s.id.slice(0, 8)} ·{" "}
                      {(s.clients as unknown as { name: string } | null)?.name ?? "Sin cliente"}
                    </p>
                  </div>
                  <StatusBadge status={s.internal_status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Todavía no hay envíos. Conectá una cuenta de Mercado Libre desde{" "}
            <Link href="/connections" className="font-medium text-blue-600 hover:underline">
              Cuentas Mercado Libre
            </Link>
            .
          </div>
        )}
      </div>
    </div>
  );
}
