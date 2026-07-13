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
 * Adaptador SIMULADO para desarrollo sin credenciales reales de ML.
 * Se activa con MERCADOLIBRE_USE_MOCK=true. Las conexiones creadas con este
 * adaptador quedan marcadas is_mock=true y NUNCA deben mezclarse con datos
 * de producción. Genera datos deterministas (seed por sellerId).
 */

const MOCK_CITIES = [
  { city: "San Isidro", province: "Buenos Aires", zip: "1642", lat: -34.4708, lng: -58.5286 },
  { city: "Vicente López", province: "Buenos Aires", zip: "1638", lat: -34.5262, lng: -58.4738 },
  { city: "Tigre", province: "Buenos Aires", zip: "1648", lat: -34.426, lng: -58.5796 },
  { city: "Pilar", province: "Buenos Aires", zip: "1629", lat: -34.4587, lng: -58.9142 },
  { city: "Quilmes", province: "Buenos Aires", zip: "1878", lat: -34.7203, lng: -58.2546 },
  { city: "CABA - Palermo", province: "CABA", zip: "1425", lat: -34.5889, lng: -58.4306 },
  { city: "CABA - Caballito", province: "CABA", zip: "1424", lat: -34.6197, lng: -58.4442 },
];

const MOCK_TITLES = [
  "Auriculares inalámbricos BT 5.3",
  "Zapatillas running talle 42",
  "Set de mates + bombilla",
  "Funda para notebook 15.6",
  "Lámpara LED de escritorio",
  "Termo acero inoxidable 1L",
  "Teclado mecánico retroiluminado",
  "Mochila urbana impermeable",
];

const MOCK_STATUSES: Array<{ status: string; substatus: string | null }> = [
  { status: "ready_to_ship", substatus: "ready_to_print" },
  { status: "ready_to_ship", substatus: "printed" },
  { status: "shipped", substatus: null },
  { status: "delivered", substatus: null },
  { status: "not_delivered", substatus: "receiver_absent" },
  { status: "cancelled", substatus: null },
];

/** PRNG determinista simple (mulberry32). */
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShipment(sellerId: number, index: number): MLShipment {
  const rand = rng(sellerId * 1000 + index);
  const cityInfo = MOCK_CITIES[Math.floor(rand() * MOCK_CITIES.length)];
  const st = MOCK_STATUSES[Math.floor(rand() * MOCK_STATUSES.length)];
  const isFlex = rand() < 0.8; // 80% Flex, resto otras logísticas
  const daysAgo = Math.floor(rand() * 14);
  const created = new Date(Date.now() - daysAgo * 86400_000);

  return {
    id: sellerId * 100000 + index,
    order_id: sellerId * 200000 + index,
    status: st.status,
    substatus: st.substatus,
    mode: "me2",
    logistic_type: isFlex ? "self_service" : "cross_docking",
    site_id: "MLA",
    tags: isFlex ? ["self_service_in"] : [],
    date_created: created.toISOString(),
    last_updated: new Date().toISOString(),
    shipping_option: {
      estimated_delivery_time: {
        date: new Date(created.getTime() + 86400_000).toISOString(),
        time_from: "09:00",
        time_to: "18:00",
      },
    },
    receiver_address: {
      street_name: ["Av. Santa Fe", "Belgrano", "Mitre", "9 de Julio", "San Martín"][
        Math.floor(rand() * 5)
      ],
      street_number: String(100 + Math.floor(rand() * 4900)),
      zip_code: cityInfo.zip,
      city: { name: cityInfo.city },
      state: { name: cityInfo.province },
      country: { id: "AR" },
      latitude: cityInfo.lat + (rand() - 0.5) * 0.02,
      longitude: cityInfo.lng + (rand() - 0.5) * 0.02,
      receiver_name: ["Ana Gómez", "Luis Fernández", "Marta López", "Diego Suárez", "Carla Ruiz"][
        Math.floor(rand() * 5)
      ],
    },
    raw: { mock: true },
  };
}

function buildOrder(sellerId: number, index: number): MLOrder {
  const rand = rng(sellerId * 7000 + index);
  const title = MOCK_TITLES[Math.floor(rand() * MOCK_TITLES.length)];
  const price = 5000 + Math.floor(rand() * 95000);
  const shipment = buildShipment(sellerId, index);
  return {
    id: sellerId * 200000 + index,
    status: shipment.status === "cancelled" ? "cancelled" : "paid",
    date_created: shipment.date_created!,
    pack_id: null,
    total_amount: price,
    currency_id: "ARS",
    seller: { id: sellerId },
    order_items: [
      {
        item: { id: `MLA${sellerId}${index}`, title, seller_sku: `SKU-${index}` },
        quantity: 1 + Math.floor(rand() * 2),
        unit_price: price,
        currency_id: "ARS",
      },
    ],
    shipping: { id: shipment.id },
    tags: [],
    raw: { mock: true },
  };
}

const MOCK_TOTAL_ORDERS = 40;

export class MercadoLibreMockAdapter implements MercadoLibreProvider {
  /** sellerId derivado del code para poder simular varias cuentas. */
  async exchangeCode(code: string): Promise<MLTokenResponse> {
    const sellerId = 100000 + (Math.abs(hash(code)) % 900);
    return {
      access_token: `MOCK-ACCESS-${sellerId}`,
      token_type: "Bearer",
      expires_in: 21600,
      scope: "offline_access read write",
      user_id: sellerId,
      refresh_token: `MOCK-REFRESH-${sellerId}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<MLTokenResponse> {
    const sellerId = Number(refreshToken.replace("MOCK-REFRESH-", "")) || 100001;
    return {
      access_token: `MOCK-ACCESS-${sellerId}`,
      token_type: "Bearer",
      expires_in: 21600,
      scope: "offline_access read write",
      user_id: sellerId,
      refresh_token: `MOCK-REFRESH-${sellerId}`,
    };
  }

  async getMe(creds: MLCredentials): Promise<MLUser> {
    const sellerId = Number(creds.accessToken.replace("MOCK-ACCESS-", "")) || 100001;
    return {
      id: sellerId,
      nickname: `TIENDA_DEMO_${sellerId}`,
      site_id: "MLA",
    };
  }

  async searchOrders(
    _creds: MLCredentials,
    sellerId: string,
    opts: { offset: number; limit: number }
  ): Promise<MLSearchResult<MLOrder>> {
    const sid = Number(sellerId);
    const results: MLOrder[] = [];
    for (let i = opts.offset; i < Math.min(opts.offset + opts.limit, MOCK_TOTAL_ORDERS); i++) {
      results.push(buildOrder(sid, i));
    }
    return {
      results,
      paging: { total: MOCK_TOTAL_ORDERS, offset: opts.offset, limit: opts.limit },
    };
  }

  async getOrder(_creds: MLCredentials, orderId: string): Promise<MLOrder> {
    const id = Number(orderId);
    const sellerId = Math.floor(id / 200000);
    return buildOrder(sellerId, id % 200000);
  }

  async getShipment(_creds: MLCredentials, shipmentId: string): Promise<MLShipment> {
    const id = Number(shipmentId);
    const sellerId = Math.floor(id / 100000);
    return buildShipment(sellerId, id % 100000);
  }

  /** Etiqueta simulada: PDF mínimo válido con el ID del envío. */
  async getShipmentLabel(_creds: MLCredentials, shipmentId: string): Promise<MLLabelFile> {
    const shipment = await this.getShipment(_creds, shipmentId);
    if (shipment.status === "cancelled") {
      // Simula que ML no entrega etiqueta de un envío cancelado
      const { MLApiError } = await import("./http");
      throw new MLApiError(404, `{"message":"label not available for cancelled shipment ${shipmentId}"}`, "/shipment_labels");
    }
    const pdf = buildMinimalPdf(`ETIQUETA FLEX (SIMULADA) - Envio ${shipmentId}`);
    return {
      contentType: "application/pdf",
      base64: pdf.toString("base64"),
      format: "pdf",
      byteLength: pdf.byteLength,
    };
  }
}

/** PDF de una página, válido, generado a mano (sin dependencias). */
function buildMinimalPdf(text: string): Buffer {
  const safe = text.replace(/[()\\]/g, "");
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${58 + safe.length}>>stream\nBT /F1 10 Tf 20 400 Td (${safe}) Tj ET\nBT /F1 8 Tf 20 380 Td (Modo demostracion - sin validez) Tj ET\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
