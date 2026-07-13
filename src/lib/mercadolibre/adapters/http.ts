import "server-only";

import type {
  MercadoLibreProvider,
  MLCredentials,
  MLLabelFile,
  MLOrder,
  MLSearchResult,
  MLShipment,
  MLTokenResponse,
  MLUser,
} from "../provider";

/**
 * Adaptador HTTP real contra api.mercadolibre.com.
 *
 * Endpoints usados (documentación oficial de Mercado Libre Developers):
 *  - POST /oauth/token                       (authorization_code / refresh_token)
 *  - GET  /users/me
 *  - GET  /orders/search?seller={id}         (paginado con offset/limit)
 *  - GET  /orders/{id}
 *  - GET  /shipments/{id}                    (header x-format-new: true)
 *
 * Manejo de errores: MLApiError conserva status y cuerpo para diferenciar
 * errores temporales (429/5xx → reintentar con backoff) de permanentes
 * (400/401/403 → renovar token o marcar needs_reauth).
 */

const API_BASE = "https://api.mercadolibre.com";

export class MLApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string
  ) {
    super(`Mercado Libre API ${status} en ${endpoint}: ${body.slice(0, 300)}`);
    this.name = "MLApiError";
  }
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function mlFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers, cache: "no-store" });
  if (!res.ok) {
    throw new MLApiError(res.status, await res.text(), path);
  }
  return (await res.json()) as T;
}

function getAppCredentials() {
  const clientId = process.env.MERCADOLIBRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan MERCADOLIBRE_CLIENT_ID / MERCADOLIBRE_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

export class MercadoLibreHttpAdapter implements MercadoLibreProvider {
  async exchangeCode(code: string, redirectUri: string): Promise<MLTokenResponse> {
    const { clientId, clientSecret } = getAppCredentials();
    return mlFetch<MLTokenResponse>("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
  }

  async refreshToken(refreshToken: string): Promise<MLTokenResponse> {
    const { clientId, clientSecret } = getAppCredentials();
    return mlFetch<MLTokenResponse>("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
  }

  async getMe(creds: MLCredentials): Promise<MLUser> {
    return mlFetch<MLUser>("/users/me", { accessToken: creds.accessToken });
  }

  async searchOrders(
    creds: MLCredentials,
    sellerId: string,
    opts: { offset: number; limit: number; dateFrom?: string; dateTo?: string }
  ): Promise<MLSearchResult<MLOrder>> {
    const params = new URLSearchParams({
      seller: sellerId,
      offset: String(opts.offset),
      limit: String(Math.min(opts.limit, 50)),
      sort: "date_desc",
    });
    if (opts.dateFrom) params.set("order.date_created.from", opts.dateFrom);
    if (opts.dateTo) params.set("order.date_created.to", opts.dateTo);
    const data = await mlFetch<MLSearchResult<MLOrder>>(
      `/orders/search?${params.toString()}`,
      { accessToken: creds.accessToken }
    );
    return {
      ...data,
      results: data.results.map((o) => ({ ...o, raw: o })),
    };
  }

  async getOrder(creds: MLCredentials, orderId: string): Promise<MLOrder> {
    const data = await mlFetch<MLOrder>(`/orders/${orderId}`, {
      accessToken: creds.accessToken,
    });
    return { ...data, raw: data };
  }

  async getShipment(creds: MLCredentials, shipmentId: string): Promise<MLShipment> {
    const data = await mlFetch<MLShipment>(`/shipments/${shipmentId}`, {
      accessToken: creds.accessToken,
      headers: { "x-format-new": "true" },
    });
    return { ...data, raw: data };
  }

  /**
   * Etiqueta del envío.
   * Endpoint documentado: GET /shipment_labels?shipment_ids={id}&response_type=pdf
   * Puede devolver PDF directo o ZIP según cantidad de envíos.
   * ⚠️ Validar con la prueba técnica (scripts/poc-labels.mjs) antes de producción.
   */
  async getShipmentLabel(creds: MLCredentials, shipmentId: string): Promise<MLLabelFile> {
    const path = `/shipment_labels?shipment_ids=${encodeURIComponent(shipmentId)}&response_type=pdf`;
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new MLApiError(res.status, await res.text(), path);
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());

    let format: MLLabelFile["format"] = "unknown";
    if (contentType.includes("pdf") || buffer.subarray(0, 4).toString() === "%PDF") format = "pdf";
    else if (contentType.includes("zip") || (buffer[0] === 0x50 && buffer[1] === 0x4b)) format = "zip";
    else if (contentType.includes("text")) format = "zpl";

    return {
      contentType,
      base64: buffer.toString("base64"),
      format,
      byteLength: buffer.byteLength,
    };
  }
}
