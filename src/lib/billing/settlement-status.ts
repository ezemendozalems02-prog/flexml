/** Etiquetas y colores de los estados de la liquidación semanal (§17). */
export const SETTLEMENT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "bg-slate-100 text-slate-700" },
  pending_review: { label: "Pendiente de revisión", className: "bg-amber-50 text-amber-800" },
  reviewed: { label: "Revisada", className: "bg-blue-50 text-blue-700" },
  confirmed: { label: "Confirmada", className: "bg-blue-50 text-blue-700" },
  sent: { label: "Enviada al cliente", className: "bg-violet-50 text-violet-700" },
  partially_paid: { label: "Parcialmente pagada", className: "bg-amber-50 text-amber-800" },
  paid: { label: "Pagada", className: "bg-emerald-50 text-emerald-700" },
  overdue: { label: "Vencida", className: "bg-red-50 text-red-700" },
  void: { label: "Anulada", className: "bg-slate-100 text-slate-400" },
};
