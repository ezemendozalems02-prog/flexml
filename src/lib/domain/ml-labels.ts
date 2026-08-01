/**
 * Traducciones al español de los códigos técnicos que informa Mercado
 * Libre (estado externo, subestado, tipo logístico, modo). Son valores de
 * ML, no nuestros — cuando aparece uno que todavía no mapeamos, se muestra
 * "humanizado" (guiones bajos -> espacios, mayúscula inicial) en vez del
 * código crudo, para que Dani no tenga que leer inglés técnico.
 */

const EXTERNAL_STATUS_ES: Record<string, string> = {
  pending: "Pendiente",
  handling: "Preparando",
  ready_to_ship: "Listo para enviar",
  shipped: "En camino",
  delivered: "Entregado",
  not_delivered: "No entregado",
  cancelled: "Cancelado",
};

const EXTERNAL_SUBSTATUS_ES: Record<string, string> = {
  ready_to_print: "Listo para imprimir etiqueta",
  printed: "Etiqueta impresa",
  invoice_pending: "Falta factura",
  picked_up: "Retirado",
  out_for_delivery: "En reparto",
  in_hub: "En depósito",
  in_transit: "En tránsito",
  delayed: "Demorado",
  soon_deliver: "Por entregar",
  receiver_absent: "Destinatario ausente",
  delivery_failed: "Entrega fallida",
  returning_to_sender: "Volviendo al vendedor",
  returned: "Devuelto",
  waiting_for_confirmation: "Esperando confirmación",
  forwarded_to_third: "Derivado a terceros",
  buyer_cancelled: "Cancelado por el comprador",
  seller_cancelled: "Cancelado por el vendedor",
};

const LOGISTIC_TYPE_ES: Record<string, string> = {
  self_service: "Flex (autoservicio)",
  cross_docking: "Cross docking",
  fulfillment: "Fulfillment (depósito ML)",
  drop_off: "Punto de despacho",
  xd_drop_off: "Punto de despacho (cross docking)",
  not_specified: "No especificado",
};

const SHIPPING_MODE_ES: Record<string, string> = {
  me2: "Mercado Envíos 2",
  me1: "Mercado Envíos 1",
  custom: "Envío personalizado",
  not_specified: "No especificado",
};

const FLEX_REASON_ES: Record<string, string> = {
  logistic_type_self_service: "Confirmado Flex (tipo de logística)",
  tag_self_service: "Confirmado Flex (etiqueta de envío)",
  no_flex_signals: "No es Flex",
  insufficient_data: "Sin datos suficientes para clasificar",
};

function humanize(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function externalStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return EXTERNAL_STATUS_ES[status] ?? humanize(status);
}

export function externalSubstatusLabel(substatus: string | null): string | null {
  if (!substatus) return null;
  return EXTERNAL_SUBSTATUS_ES[substatus] ?? humanize(substatus);
}

export function logisticTypeLabel(type: string | null): string | null {
  if (!type) return null;
  return LOGISTIC_TYPE_ES[type] ?? humanize(type);
}

export function shippingModeLabel(mode: string | null): string | null {
  if (!mode) return null;
  return SHIPPING_MODE_ES[mode] ?? humanize(mode);
}

export function flexReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return FLEX_REASON_ES[reason] ?? humanize(reason);
}
