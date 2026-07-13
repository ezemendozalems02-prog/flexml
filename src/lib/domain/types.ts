import type { InternalStatus } from "./statuses";

/** Roles de membresía dentro de una organización. */
export type MemberRole = "owner" | "admin" | "operator" | "client" | "driver";

export type ConnectionStatus =
  | "connecting"
  | "active"
  | "syncing"
  | "error"
  | "token_expired"
  | "auth_revoked"
  | "disconnected"
  | "needs_reauth";

export type EventSource =
  | "mercadolibre"
  | "scheduled_sync"
  | "admin"
  | "operator"
  | "driver"
  | "client"
  | "automation"
  | "import"
  | "system";

export interface Organization {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  timezone: string;
  currency: string;
  country: string;
  status: string;
  is_demo: boolean;
}

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  client_id: string | null;
  driver_id: string | null;
  status: string;
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_zip: string | null;
  status: string;
}

export interface MarketplaceConnection {
  id: string;
  organization_id: string;
  client_id: string;
  provider: string;
  external_user_id: string;
  nickname: string | null;
  site_id: string | null;
  status: ConnectionStatus;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  is_mock: boolean;
}

export interface Shipment {
  id: string;
  organization_id: string;
  client_id: string;
  connection_id: string | null;
  external_shipment_id: string | null;
  external_order_id: string | null;
  sold_at: string | null;
  title_summary: string | null;
  package_count: number;
  logistic_type: string | null;
  shipping_mode: string | null;
  promised_date: string | null;
  external_status: string | null;
  external_substatus: string | null;
  external_tags: string[];
  is_flex: boolean | null;
  internal_status: InternalStatus;
  zone_id: string | null;
  route_id: string | null;
  driver_id: string | null;
  attempt_count: number;
  delivered_at: string | null;
  requires_review: boolean;
  data_incomplete: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShipmentAddress {
  shipment_id: string;
  receiver_name: string | null;
  street: string | null;
  street_number: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
}

export interface Zone {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  priority: number;
  status: string;
}

export interface Driver {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  photo_url: string | null;
}
