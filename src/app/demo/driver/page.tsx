import { demoShipments } from "@/lib/demo/fixtures";
import { StatusBadge } from "@/components/ui/badge";
import {
  ChevronRight,
  Package,
  PackageCheck,
  PackageX,
  MapPin,
  Navigation,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const metadata = { title: "App repartidor (demo)" };

export default function DemoDriver() {
  const mine = demoShipments.filter((s) => s.driver === "Juan Pérez");
  const pending = mine.filter((s) => s.internal_status !== "delivered");
  const delivered = mine.filter((s) => s.internal_status === "delivered");
  const next = pending[0];

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <p className="text-center text-xs text-slate-400">
        Vista móvil del repartidor (así se ve en el teléfono, instalable como app)
      </p>

      <div className="overflow-hidden rounded-3xl border-8 border-slate-900 bg-slate-100 shadow-xl">
        <div className="flex h-12 items-center justify-between bg-slate-900 px-4 text-white">
          <span className="text-sm font-bold">FlexControl</span>
          <span className="text-xs text-slate-300">Juan Pérez</span>
        </div>

        <div className="space-y-3 p-3">
          <div>
            <h1 className="text-lg font-bold">Hola, Juan 👋</h1>
            <p className="text-xs text-slate-500">Tu recorrido de hoy</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white p-2 text-center shadow-sm ring-1 ring-slate-200">
              <Package className="mx-auto h-4 w-4 text-slate-400" />
              <p className="text-lg font-bold">{mine.length}</p>
              <p className="text-[10px] text-slate-500">Total</p>
            </div>
            <div className="rounded-xl bg-white p-2 text-center shadow-sm ring-1 ring-slate-200">
              <PackageCheck className="mx-auto h-4 w-4 text-emerald-500" />
              <p className="text-lg font-bold">{delivered.length}</p>
              <p className="text-[10px] text-slate-500">Entregados</p>
            </div>
            <div className="rounded-xl bg-white p-2 text-center shadow-sm ring-1 ring-slate-200">
              <PackageX className="mx-auto h-4 w-4 text-orange-500" />
              <p className="text-lg font-bold">{pending.length}</p>
              <p className="text-[10px] text-slate-500">Pendientes</p>
            </div>
          </div>

          {next && (
            <div className="rounded-xl bg-slate-900 p-3 text-white shadow-md">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Próxima entrega</p>
              <p className="mt-0.5 text-sm font-semibold">
                {next.street}, {next.city}
              </p>
              <p className="text-xs text-slate-300">{next.title_summary}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-900">
                Continuar <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          )}

          {/* Detalle de la próxima entrega */}
          {next && (
            <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-semibold">{next.street}</p>
                  <p className="text-xs text-slate-500">
                    {next.city} · CP {next.zip} · {next.receiver}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white">
                <Navigation className="h-4 w-4" /> Abrir en Google Maps
              </div>
              <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white">
                <CheckCircle2 className="h-4 w-4" /> Entregar
              </div>
              <div className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-bold text-white">
                <XCircle className="h-4 w-4" /> No pude entregar
              </div>
              <p className="text-center text-[10px] text-slate-400">
                (Botones ilustrativos: en la app real registran receptor, motivo, foto,
                observación y ubicación)
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Pendientes ({pending.length})
            </h2>
            {pending.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-900">
                    {s.street}, {s.city}
                  </p>
                  <div className="mt-0.5">
                    <StatusBadge status={s.internal_status} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-12 items-center justify-around border-t border-slate-200 bg-white text-[10px] font-medium text-slate-600">
          <span>Hoy</span>
          <span>Historial</span>
          <span>Perfil</span>
          <span>Salir</span>
        </div>
      </div>
    </div>
  );
}
