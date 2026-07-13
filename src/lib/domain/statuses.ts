/**
 * Estado operativo INTERNO del envío. Es independiente del estado externo
 * que informa Mercado Libre (que se guarda tal cual en external_status).
 * Debe coincidir con el enum `internal_status` de la base de datos.
 */
export const INTERNAL_STATUSES = [
  "imported",
  "pending_classification",
  "pending_pickup",
  "picked_up",
  "at_warehouse",
  "classified",
  "assigned",
  "route_prep",
  "out_for_delivery",
  "visited",
  "delivered",
  "partial_delivery",
  "not_answered",
  "absent",
  "wrong_address",
  "incomplete_address",
  "dangerous_zone",
  "rejected",
  "rescheduled",
  "cancelled_by_ml",
  "cancelled_by_client",
  "returned",
  "pending_return",
  "returned_to_seller",
  "lost",
  "damaged",
  "under_review",
] as const;

export type InternalStatus = (typeof INTERNAL_STATUSES)[number];

type StatusMeta = {
  label: string;
  /** grupo semántico para color y agregaciones */
  group:
    | "pending"
    | "in_transit"
    | "delivered"
    | "incident"
    | "cancelled"
    | "returned"
    | "review";
};

export const INTERNAL_STATUS_META: Record<InternalStatus, StatusMeta> = {
  imported: { label: "Importado", group: "pending" },
  pending_classification: { label: "Pendiente de clasificación", group: "pending" },
  pending_pickup: { label: "Pendiente de retiro", group: "pending" },
  picked_up: { label: "Retirado", group: "in_transit" },
  at_warehouse: { label: "En depósito", group: "in_transit" },
  classified: { label: "Clasificado", group: "pending" },
  assigned: { label: "Asignado", group: "pending" },
  route_prep: { label: "Preparando ruta", group: "in_transit" },
  out_for_delivery: { label: "En reparto", group: "in_transit" },
  visited: { label: "Visitado", group: "in_transit" },
  delivered: { label: "Entregado", group: "delivered" },
  partial_delivery: { label: "Entrega parcial", group: "incident" },
  not_answered: { label: "No responde", group: "incident" },
  absent: { label: "Ausente", group: "incident" },
  wrong_address: { label: "Dirección incorrecta", group: "incident" },
  incomplete_address: { label: "Dirección incompleta", group: "incident" },
  dangerous_zone: { label: "Zona peligrosa", group: "incident" },
  rejected: { label: "Rechazado", group: "incident" },
  rescheduled: { label: "Reprogramado", group: "incident" },
  cancelled_by_ml: { label: "Cancelado por Mercado Libre", group: "cancelled" },
  cancelled_by_client: { label: "Cancelado por el cliente", group: "cancelled" },
  returned: { label: "Devuelto", group: "returned" },
  pending_return: { label: "Pendiente de devolución", group: "returned" },
  returned_to_seller: { label: "Devuelto al comercio", group: "returned" },
  lost: { label: "Extraviado", group: "review" },
  damaged: { label: "Dañado", group: "review" },
  under_review: { label: "En revisión", group: "review" },
};

/** Clases Tailwind por grupo (badge). Paleta sobria: ver docs/ARQUITECTURA.md §Diseño. */
export const STATUS_GROUP_BADGE: Record<StatusMeta["group"], string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-200",
  in_transit: "bg-blue-50 text-blue-700 ring-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  incident: "bg-orange-50 text-orange-700 ring-orange-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  returned: "bg-violet-50 text-violet-700 ring-violet-200",
  review: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function internalStatusLabel(status: string): string {
  return INTERNAL_STATUS_META[status as InternalStatus]?.label ?? status;
}

export function internalStatusBadgeClass(status: string): string {
  const meta = INTERNAL_STATUS_META[status as InternalStatus];
  return meta ? STATUS_GROUP_BADGE[meta.group] : STATUS_GROUP_BADGE.pending;
}

/** Estados que cuentan como "terminales" para efectividad semanal. */
export const TERMINAL_STATUSES: InternalStatus[] = [
  "delivered",
  "cancelled_by_ml",
  "cancelled_by_client",
  "returned",
  "returned_to_seller",
  "lost",
];
