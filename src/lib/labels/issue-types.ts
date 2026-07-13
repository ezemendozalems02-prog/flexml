/** Problemas frecuentes de etiquetas (§7) — catálogo compartido UI/backend. */
export const ISSUE_TYPES: Record<string, string> = {
  wont_open: "La etiqueta no abre",
  cancelled: "La etiqueta está cancelada",
  wrong_package: "La etiqueta corresponde a otro paquete",
  address_mismatch: "La dirección no coincide",
  duplicated: "La etiqueta está duplicada",
  reprint: "Necesito volver a imprimir",
  ml_not_returning: "Mercado Libre no la devuelve",
  other: "Otro problema",
};

export const ISSUE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  new: { label: "Nuevo", className: "bg-blue-50 text-blue-700" },
  in_review: { label: "En revisión", className: "bg-amber-50 text-amber-800" },
  waiting_ml: { label: "Esperando Mercado Libre", className: "bg-violet-50 text-violet-700" },
  resolved: { label: "Resuelto", className: "bg-emerald-50 text-emerald-700" },
  closed: { label: "Cerrado", className: "bg-slate-100 text-slate-500" },
  not_resolvable: { label: "No resoluble mediante API", className: "bg-red-50 text-red-700" },
};

export const LABEL_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-slate-100 text-slate-700" },
  available: { label: "Disponible", className: "bg-emerald-50 text-emerald-700" },
  downloaded: { label: "Descargada", className: "bg-emerald-50 text-emerald-700" },
  printed: { label: "Impresa", className: "bg-blue-50 text-blue-700" },
  reprinted: { label: "Reimpresa", className: "bg-blue-50 text-blue-700" },
  refreshing: { label: "En actualización", className: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Cancelada", className: "bg-red-50 text-red-700" },
  replaced: { label: "Reemplazada", className: "bg-violet-50 text-violet-700" },
  unavailable: { label: "No disponible", className: "bg-orange-50 text-orange-700" },
  unauthorized: { label: "Acceso no autorizado", className: "bg-red-50 text-red-700" },
  ml_error: { label: "Error de Mercado Libre", className: "bg-orange-50 text-orange-700" },
  needs_review: { label: "Requiere revisión", className: "bg-amber-50 text-amber-800" },
};
