import "server-only";

import type {
  MercadoLibreProvider,
  MLCredentials,
  MLFlexDriver,
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

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
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
  async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<MLTokenResponse> {
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
        code_verifier: codeVerifier,
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
    // ML documenta fechas ISO con offset explícito ("-00:00"); rechaza el sufijo Z
    if (opts.dateFrom) params.set("order.date_created.from", opts.dateFrom.replace(/Z$/, "-00:00"));
    if (opts.dateTo) params.set("order.date_created.to", opts.dateTo.replace(/Z$/, "-00:00"));
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
    const data = await mlFetch<
      MLShipment & {
        logistic?: { type?: string; mode?: string };
        destination?: { shipping_address?: MLShipment["receiver_address"] };
      }
    >(`/shipments/${shipmentId}`, {
      accessToken: creds.accessToken,
      headers: { "x-format-new": "true" },
    });
    // Con x-format-new: true, ML reubica varios campos del formato clásico
    // (confirmado con datos reales, todo venía null/vacío):
    //  - logistic_type/mode -> anidados en "logistic": {type, mode, direction}
    //  - receiver_address    -> "destination.shipping_address" (misma forma interna)
    // Se completan los campos planos que espera el resto del código, con
    // fallback por si ML los manda planos en algún caso.
    return {
      ...data,
      logistic_type: data.logistic_type ?? data.logistic?.type,
      mode: data.mode ?? data.logistic?.mode,
      receiver_address: data.receiver_address ?? data.destination?.shipping_address,
      raw: data,
    };
  }

  /**
   * Conductor Flex asignado. La respuesta documentada es {"driver_id": 1234};
   * el nombre no está documentado, así que se parsea de forma laxa (por si ML
   * lo agrega) y como plan B se consulta /shipments/{id}/carrier, que devuelve
   * el nombre del transportista a cargo. 404 = sin asignación todavía.
   */
  async getFlexDriver(
    creds: MLCredentials,
    siteId: string,
    shipmentId: string
  ): Promise<MLFlexDriver | null> {
    let raw: Record<string, unknown>;
    try {
      raw = await mlFetch<Record<string, unknown>>(
        `/flex/sites/${encodeURIComponent(siteId)}/shipments/${encodeURIComponent(shipmentId)}/assignment/v1`,
        { accessToken: creds.accessToken }
      );
    } catch (err) {
      if (err instanceof MLApiError && err.status === 404) return null;
      throw err;
    }

    const driverId = raw.driver_id != null ? String(raw.driver_id) : null;
    const driverObj = (raw.driver ?? null) as Record<string, unknown> | null;
    let driverName = pickString(raw, "driver_name", "name");
    if (!driverName && driverObj) {
      driverName =
        pickString(driverObj, "name") ??
        ([pickString(driverObj, "first_name"), pickString(driverObj, "last_name")]
          .filter(Boolean)
          .join(" ") ||
          null);
    }

    if (!driverName) {
      try {
        const carrier = await mlFetch<Record<string, unknown>>(
          `/shipments/${encodeURIComponent(shipmentId)}/carrier`,
          { accessToken: creds.accessToken }
        );
        driverName = pickString(carrier, "name", "carrier_name");
      } catch {
        // mejor esfuerzo: el nombre queda null y se muestra el id
      }
    }

    return { driverId, driverName: driverName || null, raw };
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
