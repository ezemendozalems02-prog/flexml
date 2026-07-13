import Link from "next/link";
import { demoShipments } from "@/lib/demo/fixtures";
import { StatusBadge, ExternalStatusBadge, FlexBadge } from "@/components/ui/badge";

export const metadata = { title: "Envíos (demo)" };

export default function DemoShipments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Envíos</h1>
        <p className="text-sm text-slate-500">
          {demoShipments.length} envíos ficticios · en la versión real esta tabla tiene
          filtros por cliente, cuenta, zona, repartidor, estado, Flex y búsqueda.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Envío</th>
              <th className="px-4 py-3">Cliente / Cuenta</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Repartidor</th>
              <th className="px-4 py-3">Flex</th>
              <th className="px-4 py-3">Estado interno</th>
              <th className="px-4 py-3">Estado ML</th>
              <th className="px-4 py-3">Int.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {demoShipments.map((s) => (
              <tr key={s.id} className="transition hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/demo/shipments/${s.id}`} className="font-medium text-blue-700 hover:underline">
                    #{s.external_shipment_id}
                  </Link>
                  <p className="max-w-[220px] truncate text-xs text-slate-500">{s.title_summary}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-700">{s.client}</p>
                  <p className="text-xs text-slate-400">{s.account}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.city} ({s.zip})
                </td>
                <td className="px-4 py-3">
                  {s.zone ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.zoneColor }} />
                      {s.zone}
                    </span>
                  ) : (
                    <span className="text-orange-600">Sin zona</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {s.driver ?? <span className="text-slate-400">Sin asignar</span>}
                </td>
                <td className="px-4 py-3">
                  <FlexBadge isFlex={s.is_flex} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.internal_status} />
                </td>
                <td className="px-4 py-3">
                  <ExternalStatusBadge status={s.external_status} />
                </td>
                <td className="px-4 py-3 text-center text-slate-700">{s.attempt_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
