import type { MLShipment } from "./provider";

/**
 * Clasificación de envíos Flex — función centralizada y versionada.
 *
 * Según la documentación pública de Mercado Envíos, los envíos Flex
 * (autoservicio del vendedor) se identifican por:
 *   - shipment.logistic_type === "self_service"
 *   - y/o el tag "self_service_in" / "self_service_out" en shipment.tags
 * con mode "me2".
 *
 * ⚠️ Esta regla debe VALIDARSE con una cuenta real antes de producción
 * (docs/PENDIENTES-VALIDACION.md). Por eso el resultado guarda motivo y
 * versión de regla, y la estrategia admite señales múltiples.
 */

export const FLEX_RULE_VERSION = "2026-07-v1";

export interface FlexClassification {
  isFlex: boolean;
  /** señal que decidió la clasificación */
  reason:
    | "logistic_type_self_service"
    | "tag_self_service"
    | "no_flex_signals"
    | "insufficient_data";
  ruleVersion: string;
}

const FLEX_LOGISTIC_TYPES = new Set(["self_service"]);
const FLEX_TAGS = new Set(["self_service_in", "self_service_out", "self_service"]);

export function classifyFlex(shipment: Pick<MLShipment, "logistic_type" | "tags" | "mode">): FlexClassification {
  const logisticType = shipment.logistic_type?.toLowerCase();
  const tags = (shipment.tags ?? []).map((t) => t.toLowerCase());

  if (logisticType && FLEX_LOGISTIC_TYPES.has(logisticType)) {
    return { isFlex: true, reason: "logistic_type_self_service", ruleVersion: FLEX_RULE_VERSION };
  }
  if (tags.some((t) => FLEX_TAGS.has(t))) {
    return { isFlex: true, reason: "tag_self_service", ruleVersion: FLEX_RULE_VERSION };
  }
  if (!logisticType && tags.length === 0) {
    // Sin datos suficientes: no clasificar como no-Flex de manera definitiva.
    return { isFlex: false, reason: "insufficient_data", ruleVersion: FLEX_RULE_VERSION };
  }
  return { isFlex: false, reason: "no_flex_signals", ruleVersion: FLEX_RULE_VERSION };
}

/** Azúcar sintáctico pedido por la especificación. */
export function isFlexShipment(shipment: Pick<MLShipment, "logistic_type" | "tags" | "mode">): boolean {
  return classifyFlex(shipment).isFlex;
}
