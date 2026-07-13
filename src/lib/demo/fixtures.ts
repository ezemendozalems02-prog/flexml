/**
 * Datos FICTICIOS para el modo demostración (/demo).
 * No tocan la base de datos; solo permiten recorrer las pantallas.
 */

import type { InternalStatus } from "@/lib/domain/statuses";

export interface DemoShipment {
  id: string;
  external_shipment_id: string;
  external_order_id: string;
  title_summary: string;
  client: string;
  account: string;
  city: string;
  zip: string;
  street: string;
  zone: string | null;
  zoneColor: string;
  driver: string | null;
  internal_status: InternalStatus;
  external_status: string;
  is_flex: boolean;
  attempt_count: number;
  promised_date: string;
  receiver: string;
  unit_price: number | null;
}

const Z = {
  caba: { name: "CABA", color: "#10b981" },
  norte: { name: "Zona Norte", color: "#3b82f6" },
  sur: { name: "Zona Sur", color: "#f59e0b" },
  oeste: { name: "Zona Oeste", color: "#8b5cf6" },
} as const;

export const demoShipments: DemoShipment[] = [
  { id: "d01", external_shipment_id: "44000000001", external_order_id: "2000000001", title_summary: "1× Auriculares inalámbricos BT 5.3", client: "ElectroHogar Online", account: "ELECTROHOGAR_ML", city: "CABA - Palermo", zip: "1425", street: "Gorriti 4521", zone: Z.caba.name, zoneColor: Z.caba.color, driver: "Juan Pérez", internal_status: "delivered", external_status: "delivered", is_flex: true, attempt_count: 1, promised_date: "2026-07-10", receiver: "Ana Gómez", unit_price: 4800 },
  { id: "d02", external_shipment_id: "44000000002", external_order_id: "2000000002", title_summary: "1× Zapatillas running talle 42", client: "Moda Urbana", account: "MODAURBANA_OFICIAL", city: "San Isidro", zip: "1642", street: "Av. Santa Fe 1290", zone: Z.norte.name, zoneColor: Z.norte.color, driver: "Juan Pérez", internal_status: "out_for_delivery", external_status: "shipped", is_flex: true, attempt_count: 0, promised_date: "2026-07-13", receiver: "Luis Fernández", unit_price: 6500 },
  { id: "d03", external_shipment_id: "44000000003", external_order_id: "2000000003", title_summary: "2× Remera oversize negra", client: "Moda Urbana", account: "MODAURBANA_OFICIAL", city: "Quilmes", zip: "1878", street: "Mitre 356", zone: Z.sur.name, zoneColor: Z.sur.color, driver: "Lucas Díaz", internal_status: "absent", external_status: "not_delivered", is_flex: true, attempt_count: 1, promised_date: "2026-07-12", receiver: "Marta López", unit_price: 6500 },
  { id: "d04", external_shipment_id: "44000000004", external_order_id: "2000000004", title_summary: "1× Termo acero inoxidable 1L", client: "Juguetería El Trompo", account: "ELTROMPO_JUGUETES", city: "Pilar", zip: "1629", street: "San Martín 2210", zone: Z.oeste.name, zoneColor: Z.oeste.color, driver: "María Sosa", internal_status: "rescheduled", external_status: "not_delivered", is_flex: true, attempt_count: 1, promised_date: "2026-07-14", receiver: "Diego Suárez", unit_price: 8000 },
  { id: "d05", external_shipment_id: "44000000005", external_order_id: "2000000005", title_summary: "1× Lámpara LED de escritorio", client: "ElectroHogar Online", account: "ELECTROHOGAR_ML", city: "Vicente López", zip: "1638", street: "Belgrano 980", zone: Z.norte.name, zoneColor: Z.norte.color, driver: "Juan Pérez", internal_status: "delivered", external_status: "delivered", is_flex: true, attempt_count: 2, promised_date: "2026-07-11", receiver: "Carla Ruiz", unit_price: 6500 },
  { id: "d06", external_shipment_id: "44000000006", external_order_id: "2000000006", title_summary: "1× Peluche dinosaurio 40cm", client: "Juguetería El Trompo", account: "ELTROMPO_JUGUETES", city: "Moreno", zip: "1744", street: "9 de Julio 1544", zone: null, zoneColor: "#94a3b8", driver: null, internal_status: "pending_classification", external_status: "ready_to_ship", is_flex: true, attempt_count: 0, promised_date: "2026-07-14", receiver: "Sergio Núñez", unit_price: null },
  { id: "d07", external_shipment_id: "44000000007", external_order_id: "2000000007", title_summary: "1× Teclado mecánico retroiluminado", client: "ElectroHogar Online", account: "ELECTROHOGAR_ML", city: "CABA - Caballito", zip: "1424", street: "Rivadavia 5102", zone: Z.caba.name, zoneColor: Z.caba.color, driver: null, internal_status: "classified", external_status: "ready_to_ship", is_flex: true, attempt_count: 0, promised_date: "2026-07-14", receiver: "Paula Ibáñez", unit_price: 4800 },
  { id: "d08", external_shipment_id: "44000000008", external_order_id: "2000000008", title_summary: "1× Mochila urbana impermeable", client: "Moda Urbana", account: "MODAURBANA_OFICIAL", city: "Tigre", zip: "1648", street: "Cazón 771", zone: Z.norte.name, zoneColor: Z.norte.color, driver: "Lucas Díaz", internal_status: "cancelled_by_ml", external_status: "cancelled", is_flex: true, attempt_count: 0, promised_date: "2026-07-12", receiver: "Romina Vega", unit_price: null },
  { id: "d09", external_shipment_id: "44000000009", external_order_id: "2000000009", title_summary: "1× Set de mates + bombilla", client: "Juguetería El Trompo", account: "ELTROMPO_JUGUETES", city: "Quilmes", zip: "1878", street: "Alsina 220", zone: Z.sur.name, zoneColor: Z.sur.color, driver: "María Sosa", internal_status: "returned_to_seller", external_status: "not_delivered", is_flex: true, attempt_count: 2, promised_date: "2026-07-09", receiver: "Héctor Silva", unit_price: 6500 },
  { id: "d10", external_shipment_id: "44000000010", external_order_id: "2000000010", title_summary: "1× Funda notebook 15.6", client: "ElectroHogar Online", account: "ELECTROHOGAR_ML", city: "San Isidro", zip: "1642", street: "Centenario 450", zone: Z.norte.name, zoneColor: Z.norte.color, driver: "Juan Pérez", internal_status: "assigned", external_status: "ready_to_ship", is_flex: true, attempt_count: 0, promised_date: "2026-07-13", receiver: "Valeria Prieto", unit_price: 6500 },
];

export const demoEvents = [
  { type: "imported", note: "Envío importado desde Mercado Libre", when: "08/07 09:15", source: "mercadolibre" },
  { type: "classified", note: "Clasificado automáticamente en Zona Norte (localidad: San Isidro)", when: "08/07 09:15", source: "system" },
  { type: "priced", note: "Precio congelado: $6.500 (tarifa general Zona Norte, regla delivered=100%)", when: "08/07 09:15", source: "system" },
  { type: "assigned", note: "Asignado a Juan Pérez", when: "08/07 11:02", source: "operator" },
  { type: "picked_up", note: "Retirado del comercio", when: "09/07 10:20", source: "driver" },
  { type: "attempt_failed", note: "Destinatario ausente — se reintenta hoy", when: "09/07 14:35", source: "driver" },
  { type: "delivered", note: "Entregado. Recibió: Carla Ruiz", when: "09/07 17:48", source: "driver" },
];

/** Liquidación de ejemplo (§16 del spec: Hugo, semana del 6 al 12 de julio). */
export const demoSettlement = {
  number: "LIQ-2026-0007",
  client: "Hugo Distribuciones",
  period: "06/07/2026 — 12/07/2026",
  status: "Borrador",
  accounts: [
    {
      nickname: "HUGO_STORE_ML",
      zones: [
        { zone: "Zona 1 (Cercana)", count: 20, unit: 5000, subtotal: 100000 },
        { zone: "Zona 2 (Intermedia)", count: 8, unit: 6500, subtotal: 52000 },
        { zone: "Zona 3 (Lejana)", count: 2, unit: 8000, subtotal: 16000 },
      ],
      subtotal: 168000,
    },
    {
      nickname: "HUGO_OUTLET",
      zones: [
        { zone: "Zona 1 (Cercana)", count: 5, unit: 5000, subtotal: 25000 },
        { zone: "Zona 2 (Intermedia)", count: 4, unit: 6500, subtotal: 26000 },
        { zone: "Zona 3 (Lejana)", count: 2, unit: 8000, subtotal: 16000 },
      ],
      subtotal: 67000,
    },
  ],
  additionals: [
    { concept: "Reintentos", quantity: 3, unit: 3000, subtotal: 9000 },
    { concept: "Devoluciones", quantity: 1, unit: 4000, subtotal: 4000 },
  ],
  zoneTotals: [
    { zone: "Zona 1 (Cercana)", count: 25, unit: 5000, subtotal: 125000 },
    { zone: "Zona 2 (Intermedia)", count: 12, unit: 6500, subtotal: 78000 },
    { zone: "Zona 3 (Lejana)", count: 4, unit: 8000, subtotal: 32000 },
  ],
  shipmentsSubtotal: 235000,
  additionalsSubtotal: 13000,
  total: 248000,
};

export const demoWhatsApp = `Hola Hugo. Te compartimos el resumen de entregas Flex correspondiente a la semana del 6/7 al 12/7.

Zona 1: 25 envíos — $ 125.000
Zona 2: 12 envíos — $ 78.000
Zona 3: 4 envíos — $ 32.000
Reintentos: $ 9.000
Devoluciones: $ 4.000

Total de la semana: $ 248.000.

Adjuntamos el detalle completo de los envíos.`;
