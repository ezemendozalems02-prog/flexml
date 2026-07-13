import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";
import { ChevronRight, PackageCheck, PackageX, Package } from "lucide-react";

export const metadata = { title: "Mi día" };

const OPEN_STATUSES = [
  "assigned",
  "route_prep",
  "out_for_delivery",
  "visited",
  "rescheduled",
];

export default async function DriverHomePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const driverId = session.membership.driver_id;

  if (!driverId) {
    return (
      <div className="rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="font-medium text-slate-800">
          Tu usuario todavía no está vinculado a un repartidor.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Pedile al administrador de tu empresa que te vincule desde el panel.
        </p>
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: shipments } = await supabase
    .from("shipments")
    .select(
      "id, external_shipment_id, title_summary, internal_status, delivery_sequence, shipment_addresses(street, street_number, city, zip)"
    )
    .eq("driver_id", driverId)
    .in("internal_status", [...OPEN_STATUSES, "delivered"])
    .order("delivery_sequence", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(200);

  const all = shipments ?? [];
  const pending = all.filter((s) => OPEN_STATUSES.includes(s.internal_status));
  const deliveredToday = all.filter((s) => s.internal_status === "delivered");
  const next = pending[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">
          Hola{session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-slate-500">Tu recorrido de hoy</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
          <Package className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-1 text-xl font-bold">{pending.length + deliveredToday.length}</p>
          <p className="text-xs text-slate-500">Total</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
          <PackageCheck className="mx-auto h-5 w-5 text-emerald-500" />
          <p className="mt-1 text-xl font-bold">{deliveredToday.length}</p>
          <p className="text-xs text-slate-500">Entregados</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
          <PackageX className="mx-auto h-5 w-5 text-orange-500" />
          <p className="mt-1 text-xl font-bold">{pending.length}</p>
          <p className="text-xs text-slate-500">Pendientes</p>
        </div>
      </div>

      {next && (
        <Link
          href={`/driver/shipment/${next.id}`}
          className="block rounded-xl bg-slate-900 p-4 text-white shadow-md"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">Próxima entrega</p>
          <p className="mt-1 text-lg font-semibold">
            {formatAddress(next.shipment_addresses)}
          </p>
          <p className="text-sm text-slate-300">{next.title_summary ?? ""}</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900">
            Continuar <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pendientes ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            No te quedan entregas pendientes. 🎉
          </p>
        )}
        {pending.map((s) => (
          <Link
            key={s.id}
            href={`/driver/shipment/${s.id}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">
                {formatAddress(s.shipment_addresses)}
              </p>
              <p className="truncate text-xs text-slate-500">
                #{s.external_shipment_id ?? s.id.slice(0, 8)} · {s.title_summary ?? ""}
              </p>
              <div className="mt-1">
                <StatusBadge status={s.internal_status} />
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatAddress(raw: unknown): string {
  const addr = raw as {
    street: string | null;
    street_number: string | null;
    city: string | null;
  } | null;
  if (!addr || !addr.street) return "Dirección no disponible";
  return `${addr.street} ${addr.street_number ?? ""}${addr.city ? `, ${addr.city}` : ""}`.trim();
}
