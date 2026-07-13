/**
 * Contrato del proveedor Mercado Libre.
 *
 * Toda comunicación con la API de ML pasa por esta interfaz. Hay dos
 * implementaciones: el adaptador HTTP real (adapters/http.ts) y el mock
 * para desarrollo sin credenciales (adapters/mock.ts). Ningún otro módulo
 * llama a api.mercadolibre.com directamente.
 *
 * Los tipos reflejan los campos documentados de la API. Campos no
 * confirmados con una cuenta real quedan opcionales y el payload completo
 * se conserva en `raw` para auditoría. Ver docs/PENDIENTES-VALIDACION.md.
 */

export interface MLTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos
  scope: string;
  user_id: number;
  refresh_token?: string;
}

export interface MLUser {
  id: number;
  nickname: string;
  site_id: string; // MLA, MLB, ...
  email?: string;
}

export interface MLOrderItem {
  item: { id: string; title: string; seller_sku?: string | null };
  quantity: number;
  unit_price: number;
  currency_id: string;
}

export interface MLOrder {
  id: number;
  status: string;
  date_created: string;
  date_closed?: string | null;
  pack_id?: number | null;
  total_amount?: number;
  currency_id?: string;
  seller: { id: number };
  buyer?: { id: number };
  order_items: MLOrderItem[];
  shipping?: { id: number | null };
  tags?: string[];
  raw?: unknown;
}

export interface MLShipmentAddress {
  address_line?: string;
  street_name?: string;
  street_number?: string;
  comment?: string;
  zip_code?: string;
  city?: { name?: string };
  state?: { name?: string };
  neighborhood?: { name?: string };
  municipality?: { name?: string };
  country?: { id?: string };
  latitude?: number;
  longitude?: number;
  receiver_name?: string;
  receiver_phone?: string;
}

export interface MLShipment {
  id: number;
  order_id?: number | null;
  status: string; // pending | ready_to_ship | shipped | delivered | not_delivered | cancelled ...
  substatus?: string | null;
  mode?: string; // me2 | me1 | custom | not_specified
  logistic_type?: string; // self_service (Flex) | cross_docking | fulfillment | drop_off | xd_drop_off ...
  service_id?: number | null;
  site_id?: string;
  tags?: string[];
  date_created?: string;
  last_updated?: string;
  shipping_option?: {
    id?: number;
    estimated_delivery_time?: {
      date?: string | null;
      time_from?: string | null;
      time_to?: string | null;
    };
  };
  receiver_address?: MLShipmentAddress;
  declared_value?: number;
  raw?: unknown;
}

export interface MLSearchResult<T> {
  results: T[];
  paging: { total: number; offset: number; limit: number };
}

/** Credenciales vigentes que el adaptador usa para llamar a la API. */
export interface MLCredentials {
  accessToken: string;
}

/**
 * Etiqueta devuelta por Mercado Libre.
 * ⚠️ El recurso documentado es GET /shipment_labels?shipment_ids=...&response_type=pdf|zpl2.
 * Formato, permisos, revalidación tras cancelación/regeneración y comportamiento
 * de packs deben confirmarse con la prueba técnica obligatoria
 * (scripts/poc-labels.mjs + docs/PENDIENTES-VALIDACION.md) antes de dar el
 * módulo por cerrado. No asumir que la etiqueta siempre está disponible.
 */
export interface MLLabelFile {
  contentType: string;
  /** contenido binario en base64 */
  base64: string;
  format: "pdf" | "zpl" | "zip" | "unknown";
  byteLength: number;
}

export interface MercadoLibreProvider {
  /** Intercambia el authorization code por tokens (server-side). */
  exchangeCode(code: string, redirectUri: string): Promise<MLTokenResponse>;
  /** Renueva credenciales con el refresh token. */
  refreshToken(refreshToken: string): Promise<MLTokenResponse>;
  /** Usuario dueño del token. */
  getMe(creds: MLCredentials): Promise<MLUser>;
  /** Órdenes del vendedor (paginado). */
  searchOrders(
    creds: MLCredentials,
    sellerId: string,
    opts: { offset: number; limit: number; dateFrom?: string; dateTo?: string }
  ): Promise<MLSearchResult<MLOrder>>;
  /** Detalle de una orden. */
  getOrder(creds: MLCredentials, orderId: string): Promise<MLOrder>;
  /** Detalle de un envío. */
  getShipment(creds: MLCredentials, shipmentId: string): Promise<MLShipment>;
  /** Etiqueta del envío (MercadoLibreLabelProvider). Lanza MLApiError si ML no la entrega. */
  getShipmentLabel(creds: MLCredentials, shipmentId: string): Promise<MLLabelFile>;
}

/** URL de autorización OAuth por site (Argentina por defecto). */
export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  siteDomain?: string; // p.ej. "com.ar"
}): string {
  const domain = params.siteDomain ?? "com.ar";
  const url = new URL(`https://auth.mercadolibre.${domain}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}
