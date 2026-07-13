import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/badge";

export const metadata = { title: "Historial" };

export default async function DriverHistoryPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const driverId = session.membership.driver_id;

  if (!driverId) {
    return <p className="text-center text-sm text-slate-500">Usuario sin repartidor vinculado.</p>;
  }

  const { data: attempts } = await supabase
    .from("shipment_attempts")
    .select("id, attempted_at, outcome, note, shipments(external_shipment_id, internal_status, title_summary)")
    .eq("driver_id", driverId)
    .order("attempted_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Historial</h1>
      {(attempts ?? []).length === 0 && (
        <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Todavía no registraste entregas.
        </p>
      )}
      {(attempts ?? []).map((a) => {
        const ship = a.shipments as unknown as {
          external_shipment_id: string | null;
          internal_status: string;
          title_summary: string | null;
        } | null;
        return (
          <div key={a.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-900">
                #{ship?.external_shipment_id ?? "—"}
              </p>
              {ship && <StatusBadge status={ship.internal_status} />}
            </div>
            <p className="truncate text-sm text-slate-500">{ship?.title_summary ?? ""}</p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(a.attempted_at).toLocaleString("es-AR")} · resultado: {a.outcome}
            </p>
            {a.note && <p className="mt-1 text-sm text-slate-600">{a.note}</p>}
          </div>
        );
      })}
    </div>
  );
}
