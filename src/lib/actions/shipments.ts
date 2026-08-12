"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireSession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";
import { internalStatusLabel, type InternalStatus } from "@/lib/domain/statuses";

/**
 * Acciones operativas sobre envíos. Regla central: TODO cambio de estado
 * interno inserta un shipment_event con estado anterior/nuevo y fuente.
 */

async function recordStatusChange(params: {
  shipmentId: string;
  organizationId: string;
  oldStatus: string;
  newStatus: InternalStatus;
  source: "admin" | "operator" | "driver";
  userId: string;
  driverId?: string | null;
  note?: string | null;
  eventType?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  await supabase.from("shipment_events").insert({
    shipment_id: params.shipmentId,
    organization_id: params.organizationId,
    event_type: params.eventType ?? "status_change",
    old_internal_status: params.oldStatus,
    new_internal_status: params.newStatus,
    user_id: params.userId,
    driver_id: params.driverId ?? null,
    source: params.source,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
  });
}

const assignSchema = z.object({
  shipmentId: z.string().uuid(),
  driverId: z.string().uuid(),
});

export async function assignDriverAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);
  const parsed = assignSchema.safeParse({
    shipmentId: formData.get("shipmentId"),
    driverId: formData.get("driverId"),
  });
  if (!parsed.success) return { error: "Datos de asignación inválidos" };

  const supabase = await createClient();

  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, internal_status, driver_id")
    .eq("id", parsed.data.shipmentId)
    .single();
  if (!shipment) return { error: "Envío no encontrado" };

  // Cerrar asignación activa previa y crear la nueva
  await supabase
    .from("shipment_assignments")
    .update({ active: false, unassigned_at: new Date().toISOString() })
    .eq("shipment_id", shipment.id)
    .eq("active", true);

  const { error: assignErr } = await supabase.from("shipment_assignments").insert({
    shipment_id: shipment.id,
    driver_id: parsed.data.driverId,
    assigned_by: session.userId,
  });
  if (assignErr) return { error: `No se pudo asignar: ${assignErr.message}` };

  const { error: updateErr } = await supabase
    .from("shipments")
    .update({
      driver_id: parsed.data.driverId,
      internal_status: "assigned",
      last_change_source: session.membership.role === "operator" ? "operator" : "admin",
    })
    .eq("id", shipment.id);
  if (updateErr) return { error: updateErr.message };

  await recordStatusChange({
    shipmentId: shipment.id,
    organizationId: shipment.organization_id,
    oldStatus: shipment.internal_status,
    newStatus: "assigned",
    source: session.membership.role === "operator" ? "operator" : "admin",
    userId: session.userId,
    driverId: parsed.data.driverId,
    eventType: "assigned",
    note: shipment.driver_id ? "Reasignado" : "Asignado",
  });

  revalidatePath(`/shipments/${shipment.id}`);
  revalidatePath("/shipments");
  return {};
}

const zoneChangeSchema = z.object({
  shipmentId: z.string().uuid(),
  zoneId: z.string().uuid().or(z.literal("")),
});

export async function setZoneAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);
  const parsed = zoneChangeSchema.safeParse({
    shipmentId: formData.get("shipmentId"),
    zoneId: formData.get("zoneId") ?? "",
  });
  if (!parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, internal_status, zone_id")
    .eq("id", parsed.data.shipmentId)
    .single();
  if (!shipment) return { error: "Envío no encontrado" };

  const newZone = parsed.data.zoneId || null;
  const { error } = await supabase
    .from("shipments")
    .update({
      zone_id: newZone,
      zone_method: "manual",
      zone_confidence: "high",
      zone_set_by: session.userId,
      internal_status:
        shipment.internal_status === "pending_classification" && newZone
          ? "classified"
          : shipment.internal_status,
    })
    .eq("id", shipment.id);
  if (error) return { error: error.message };

  const supabase2 = await createClient();
  await supabase2.from("shipment_events").insert({
    shipment_id: shipment.id,
    organization_id: shipment.organization_id,
    event_type: "zone_change",
    user_id: session.userId,
    source: session.membership.role === "operator" ? "operator" : "admin",
    note: newZone ? "Zona corregida manualmente" : "Zona quitada",
    metadata: { old_zone_id: shipment.zone_id, new_zone_id: newZone },
  });

  revalidatePath(`/shipments/${shipment.id}`);
  revalidatePath("/shipments");
  return {};
}

// ---------------------------------------------------------------------------
// Acciones del repartidor (PWA)
// ---------------------------------------------------------------------------

const deliverSchema = z.object({
  shipmentId: z.string().uuid(),
  receiverName: z.string().optional(),
  note: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export async function markDeliveredAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  if (session.membership.role === "driver" && !session.membership.driver_id) {
    return { error: "Tu usuario no está vinculado a un repartidor" };
  }

  const parsed = deliverSchema.safeParse({
    shipmentId: formData.get("shipmentId"),
    receiverName: formData.get("receiverName") || undefined,
    note: formData.get("note") || undefined,
    lat: formData.get("lat") || undefined,
    lng: formData.get("lng") || undefined,
  });
  if (!parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, internal_status, driver_id, attempt_count")
    .eq("id", parsed.data.shipmentId)
    .single();
  if (!shipment) return { error: "Envío no encontrado" };

  if (
    session.membership.role === "driver" &&
    shipment.driver_id !== session.membership.driver_id
  ) {
    return { error: "Este envío no está asignado a tu usuario" };
  }

  const now = new Date().toISOString();
  const attemptNumber = shipment.attempt_count + 1;

  const { error: updErr } = await supabase
    .from("shipments")
    .update({
      internal_status: "delivered",
      delivered_at: now,
      attempt_count: attemptNumber,
      first_attempt_at: shipment.attempt_count === 0 ? now : undefined,
      result: "delivered",
      last_change_source: "driver",
    })
    .eq("id", shipment.id);
  if (updErr) return { error: updErr.message };

  await supabase.from("shipment_attempts").insert({
    shipment_id: shipment.id,
    driver_id: shipment.driver_id,
    attempt_number: attemptNumber,
    outcome: "delivered",
    receiver_name: parsed.data.receiverName ?? null,
    note: parsed.data.note ?? null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
  });

  await recordStatusChange({
    shipmentId: shipment.id,
    organizationId: shipment.organization_id,
    oldStatus: shipment.internal_status,
    newStatus: "delivered",
    source: "driver",
    userId: session.userId,
    driverId: shipment.driver_id,
    eventType: "delivered",
    note: parsed.data.receiverName
      ? `Recibió: ${parsed.data.receiverName}`
      : "Entregado",
  });

  revalidatePath("/driver");
  revalidatePath(`/shipments/${shipment.id}`);
  return {};
}

const failSchema = z.object({
  shipmentId: z.string().uuid(),
  incidentReasonId: z.string().uuid(),
  nextStep: z.enum(["retry_today", "reschedule", "return", "review"]),
  note: z.string().optional(),
  rescheduledTo: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

const NEXT_STEP_STATUS: Record<string, InternalStatus> = {
  retry_today: "visited",
  reschedule: "rescheduled",
  return: "pending_return",
  review: "under_review",
};

export async function markFailedAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = failSchema.safeParse({
    shipmentId: formData.get("shipmentId"),
    incidentReasonId: formData.get("incidentReasonId"),
    nextStep: formData.get("nextStep"),
    note: formData.get("note") || undefined,
    rescheduledTo: formData.get("rescheduledTo") || undefined,
    lat: formData.get("lat") || undefined,
    lng: formData.get("lng") || undefined,
  });
  if (!parsed.success) return { error: "Completá el motivo y el paso siguiente" };

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, internal_status, driver_id, attempt_count")
    .eq("id", parsed.data.shipmentId)
    .single();
  if (!shipment) return { error: "Envío no encontrado" };

  if (
    session.membership.role === "driver" &&
    shipment.driver_id !== session.membership.driver_id
  ) {
    return { error: "Este envío no está asignado a tu usuario" };
  }

  const { data: reason } = await supabase
    .from("incident_reasons")
    .select("id, label, requires_note")
    .eq("id", parsed.data.incidentReasonId)
    .single();
  if (!reason) return { error: "Motivo de incidencia inválido" };
  if (reason.requires_note && !parsed.data.note) {
    return { error: `El motivo "${reason.label}" requiere una observación` };
  }
  if (parsed.data.nextStep === "reschedule" && !parsed.data.rescheduledTo) {
    return { error: "Indicá la nueva fecha de entrega" };
  }

  const newStatus = NEXT_STEP_STATUS[parsed.data.nextStep];
  const now = new Date().toISOString();
  const attemptNumber = shipment.attempt_count + 1;

  const { error: updErr } = await supabase
    .from("shipments")
    .update({
      internal_status: newStatus,
      attempt_count: attemptNumber,
      first_attempt_at: shipment.attempt_count === 0 ? now : undefined,
      incident_reason_id: reason.id,
      rescheduled_to: parsed.data.rescheduledTo ?? null,
      requires_review: parsed.data.nextStep === "review",
      result: "failed_attempt",
      last_change_source: "driver",
    })
    .eq("id", shipment.id);
  if (updErr) return { error: updErr.message };

  await supabase.from("shipment_attempts").insert({
    shipment_id: shipment.id,
    driver_id: shipment.driver_id,
    attempt_number: attemptNumber,
    outcome: parsed.data.nextStep === "reschedule" ? "rescheduled" : "failed",
    incident_reason_id: reason.id,
    note: parsed.data.note ?? null,
    rescheduled_to: parsed.data.rescheduledTo ?? null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
  });

  await recordStatusChange({
    shipmentId: shipment.id,
    organizationId: shipment.organization_id,
    oldStatus: shipment.internal_status,
    newStatus,
    source: "driver",
    userId: session.userId,
    driverId: shipment.driver_id,
    eventType: "attempt_failed",
    note: `${reason.label}${parsed.data.note ? ` — ${parsed.data.note}` : ""}`,
  });

  revalidatePath("/driver");
  revalidatePath(`/shipments/${shipment.id}`);
  return {};
}

// ---------------------------------------------------------------------------
// Escaneo de paquetes (repartidor) — reusa asignación + trazabilidad ya
// existentes, solo cambia CÓMO se dispara: en vez de que un admin elija del
// desplegable, el propio repartidor "reclama" el envío leyendo el código de
// la etiqueta con la cámara.
// ---------------------------------------------------------------------------

export type ScanResult = {
  ok: boolean;
  message: string;
  shipmentId?: string;
  externalId?: string;
};

/** Estados desde los que ya no tiene sentido "retirar" el paquete de nuevo. */
const TERMINAL_FOR_SCAN = [
  "delivered",
  "cancelled_by_ml",
  "cancelled_by_client",
  "returned",
  "pending_return",
  "returned_to_seller",
  "lost",
];

/**
 * El código de barras y el QR de la etiqueta Flex codifican el Shipment ID
 * de Mercado Libre (el mismo id que guardamos en external_shipment_id) —
 * confirmado por la documentación pública de ML, no por el formato exacto
 * del símbolo. Nos quedamos con la secuencia numérica más larga por si el
 * lector agrega texto/URLs alrededor del id.
 */
function extractShipmentId(raw: string): string {
  const digits = raw.match(/\d{6,}/g);
  if (!digits || digits.length === 0) return raw.trim();
  return digits.reduce((longest, d) => (d.length > longest.length ? d : longest), digits[0]);
}

export async function scanPickupAction(
  rawCode: string,
  coords?: { lat: number; lng: number }
): Promise<ScanResult> {
  const session = await requireSession();
  if (session.membership.role !== "driver" || !session.membership.driver_id) {
    return { ok: false, message: "Solo los repartidores pueden escanear paquetes" };
  }

  const code = rawCode?.trim();
  if (!code) return { ok: false, message: "Código vacío" };
  const externalId = extractShipmentId(code);
  const driverId = session.membership.driver_id;

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select(
      "id, organization_id, internal_status, driver_id, picked_up_at, drivers(first_name, last_name)"
    )
    .eq("organization_id", session.organization.id)
    .eq("external_shipment_id", externalId)
    .maybeSingle();

  if (!shipment) {
    return {
      ok: false,
      message: `No encontramos ningún envío con el código ${externalId}`,
      externalId,
    };
  }

  if (TERMINAL_FOR_SCAN.includes(shipment.internal_status)) {
    return {
      ok: false,
      message: `Este envío ya está cerrado (${internalStatusLabel(shipment.internal_status)})`,
      shipmentId: shipment.id,
      externalId,
    };
  }

  const otherDriver = shipment.drivers as unknown as {
    first_name: string;
    last_name: string;
  } | null;

  // Ya lo tiene OTRO repartidor activo -> bloquear (punto 3 del pedido)
  if (shipment.driver_id && shipment.driver_id !== driverId) {
    const name = otherDriver ? `${otherDriver.first_name} ${otherDriver.last_name}`.trim() : "otro repartidor";
    return {
      ok: false,
      message: `Este paquete ya fue retirado por ${name}`,
      shipmentId: shipment.id,
      externalId,
    };
  }

  // Ya lo escaneaste vos antes -> no repetir el registro, solo confirmar
  if (shipment.driver_id === driverId && shipment.picked_up_at) {
    return {
      ok: true,
      message: "Ya tenías este paquete escaneado",
      shipmentId: shipment.id,
      externalId,
    };
  }

  const now = new Date().toISOString();

  // Sin dueño todavía (o asignado a vos pero sin confirmar retiro): reclamarlo
  if (shipment.driver_id !== driverId) {
    await supabase
      .from("shipment_assignments")
      .update({ active: false, unassigned_at: now })
      .eq("shipment_id", shipment.id)
      .eq("active", true);

    const { error: assignErr } = await supabase.from("shipment_assignments").insert({
      shipment_id: shipment.id,
      driver_id: driverId,
      assigned_by: session.userId,
    });
    if (assignErr) {
      return { ok: false, message: `No se pudo asignar: ${assignErr.message}`, externalId };
    }
  }

  const { error: updErr } = await supabase
    .from("shipments")
    .update({
      driver_id: driverId,
      internal_status: "picked_up",
      picked_up_at: now,
      last_change_source: "driver",
    })
    .eq("id", shipment.id);
  if (updErr) return { ok: false, message: updErr.message, externalId };

  await recordStatusChange({
    shipmentId: shipment.id,
    organizationId: shipment.organization_id,
    oldStatus: shipment.internal_status,
    newStatus: "picked_up",
    source: "driver",
    userId: session.userId,
    driverId,
    eventType: "picked_up_scan",
    note: "Retirado por escaneo de código",
    metadata: coords ? { lat: coords.lat, lng: coords.lng } : {},
  });

  revalidatePath("/driver");
  revalidatePath(`/driver/shipment/${shipment.id}`);
  revalidatePath("/shipments");
  revalidatePath(`/shipments/${shipment.id}`);

  return {
    ok: true,
    message: "Paquete retirado y asignado a vos",
    shipmentId: shipment.id,
    externalId,
  };
}
