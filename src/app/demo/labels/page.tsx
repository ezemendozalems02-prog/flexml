import { demoShipments } from "@/lib/demo/fixtures";
import { StatusBadge } from "@/components/ui/badge";
import { Search, Eye, Download, Printer, Flag } from "lucide-react";

export const metadata = { title: "Etiquetas Flex (demo)" };

const LABEL_STATE: Record<string, { label: string; className: string }> = {
  delivered: { label: "Descargada", className: "bg-emerald-50 text-emerald-700" },
  out_for_delivery: { label: "Impresa", className: "bg-blue-50 text-blue-700" },
  assigned: { label: "Disponible", className: "bg-emerald-50 text-emerald-700" },
  classified: { label: "Disponible", className: "bg-emerald-50 text-emerald-700" },
  rescheduled: { label: "Reimpresa", className: "bg-blue-50 text-blue-700" },
  absent: { label: "Disponible", className: "bg-emerald-50 text-emerald-700" },
  cancelled_by_ml: { label: "Cancelada", className: "bg-red-50 text-red-700" },
  returned_to_seller: { label: "No disponible", className: "bg-orange-50 text-orange-700" },
  pending_classification: { label: "Pendiente", className: "bg-slate-100 text-slate-600" },
};

export default function DemoLabelsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Etiquetas Flex</h1>
        <p className="text-sm text-slate-500">
          El vendedor busca su venta y descarga o imprime la etiqueta sin escribirle al
          administrador. Este módulo <strong>no muestra precios</strong> a vendedores ni
          repartidores.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Buscar por ID de venta, ID de envío o producto…"
            className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-11 pr-3 text-base shadow-sm"
            readOnly
          />
        </div>
        <span className="flex items-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white">
          Buscar
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Venta / Envío</th>
              <th className="px-4 py-3">Cliente / Cuenta</th>
              <th className="px-4 py-3">Localidad</th>
              <th className="px-4 py-3">Estado envío</th>
              <th className="px-4 py-3">Etiqueta</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {demoShipments.map((s) => {
              const lst = LABEL_STATE[s.internal_status] ?? LABEL_STATE.pending_classification;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.external_order_id}</p>
                    <p className="text-xs text-slate-400">#{s.external_shipment_id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{s.client}</p>
                    <p className="text-xs text-slate-400">{s.account}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.city} ({s.zip})
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.internal_status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lst.className}`}>
                      {lst.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                        <Eye className="h-3 w-3" /> Ver
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ring-1 ring-slate-300">
                        <Download className="h-3 w-3" /> PDF
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ring-1 ring-slate-300">
                        <Printer className="h-3 w-3" />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-orange-600 ring-1 ring-orange-200">
                        <Flag className="h-3 w-3" />
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        En la versión real: cada acceso queda auditado (quién, cuándo, desde dónde), la
        etiqueta se descarga desde el servidor con la conexión OAuth del comercio (sin
        exponer tokens), se guarda en un bucket privado con URLs firmadas temporales, y si
        Mercado Libre no la entrega se muestra el motivo y se puede reportar el problema
        como ticket para el administrador.
      </p>
    </div>
  );
}
