import Link from "next/link";
import { demoShipments } from "@/lib/demo/fixtures";
import { StatusBadge } from "@/components/ui/badge";
import { AlertTriangle, Package, TrendingUp, PlugZap } from "lucide-react";

export const metadata = { title: "Dashboard (demo)" };

export default function DemoDashboard() {
  const total = demoShipments.length;
  const delivered = demoShipments.filter((s) => s.internal_status === "delivered").length;
  const inDelivery = demoShipments.filter((s) => s.internal_status === "out_for_delivery").length;
  const unassigned = demoShipments.filter((s) => !s.driver && !s.internal_status.startsWith("cancelled")).length;
  const noZone = demoShipments.filter((s) => !s.zone).length;

  const cards = [
    { label: "Envíos totales", value: total, icon: Package },
    { label: "Ingresados hoy", value: 4, icon: TrendingUp },
    { label: "En reparto", value: inDelivery, icon: Package },
    { label: "Entregados", value: delivered, icon: Package },
    { label: "Sin repartidor", value: unassigned, icon: AlertTriangle },
    { label: "Sin zona", value: noZone, icon: AlertTriangle },
    { label: "Requieren revisión", value: 2, icon: AlertTriangle },
    { label: "Efectividad", value: `${Math.round((delivered / (total - 1)) * 100)}%`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Resumen operativo de Transportes Demo SRL</p>
      </div>

      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex items-center gap-2 font-medium text-orange-800">
          <PlugZap className="h-4 w-4" />
          Cuentas de Mercado Libre con problemas
        </div>
        <p className="mt-1 text-sm text-orange-700">
          ELTROMPO_JUGUETES — requiere reconexión: el comercio debe autorizar de nuevo.
        </p>
      </div>

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
          <Link href="/demo/shipments" className="text-sm font-medium text-blue-600 hover:underline">
            Ver todos
          </Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {demoShipments.slice(0, 6).map((s) => (
            <li key={s.id}>
              <Link
                href={`/demo/shipments/${s.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{s.title_summary}</p>
                  <p className="text-xs text-slate-500">
                    #{s.external_shipment_id} · {s.client}
                  </p>
                </div>
                <StatusBadge status={s.internal_status} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
