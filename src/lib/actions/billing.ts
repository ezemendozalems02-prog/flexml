"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";
import { normalizeLocationName } from "@/lib/billing/normalization";
import {
  generateWeeklySettlement,
  refreshSettlementTotals,
} from "@/lib/billing/settlement-service";
import { getWeekStart, toDateString } from "@/lib/reports/weekly";

// ---------------------------------------------------------------------------
// Localidades y alias (§2, §3)
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  name: z.string().min(2, "Ingresá el nombre de la localidad"),
  province: z.string().optional(),
  district: z.string().optional(),
  zip: z.string().optional(),
  zoneId: z.string().uuid().optional().or(z.literal("")),
  aliases: z.string().optional(),
});

export async function createLocationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);
  const parsed = locationSchema.safeParse({
    name: formData.get("name"),
    province: formData.get("province") || undefined,
    district: formData.get("district") || undefined,
    zip: formData.get("zip") || undefined,
    zoneId: formData.get("zoneId") ?? "",
    aliases: formData.get("aliases") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      normalized_name: normalizeLocationName(parsed.data.name),
      province: parsed.data.province ?? null,
      district: parsed.data.district ?? null,
      zip: parsed.data.zip ?? null,
      zone_id: parsed.data.zoneId || null,
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !location) {
    return {
      error: error?.message.includes("duplicate")
        ? "Ya existe una localidad con ese nombre"
        : `No se pudo crear la localidad: ${error?.message}`,
    };
  }

  const aliases = (parsed.data.aliases ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  for (const alias of aliases) {
    await supabase.from("location_aliases").insert({
      organization_id: session.organization.id,
      location_id: location.id,
      alias,
      normalized_alias: normalizeLocationName(alias),
      created_by: session.userId,
    });
  }

  revalidatePath("/locations");
  return {};
}

const aliasSchema = z.object({
  locationId: z.string().uuid(),
  alias: z.string().min(2, "Ingresá el alias"),
});

export async function addAliasAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);
  const parsed = aliasSchema.safeParse({
    locationId: formData.get("locationId"),
    alias: formData.get("alias"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("location_aliases").insert({
    organization_id: session.organization.id,
    location_id: parsed.data.locationId,
    alias: parsed.data.alias,
    normalized_alias: normalizeLocationName(parsed.data.alias),
    created_by: session.userId,
  });
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ese alias ya está asignado a una localidad"
        : error.message,
    };
  }
  revalidatePath("/locations");
  return {};
}

const assignZoneSchema = z.object({
  locationId: z.string().uuid(),
  zoneId: z.string().uuid().or(z.literal("")),
});

export async function assignLocationZoneAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin", "operator"]);
  const parsed = assignZoneSchema.safeParse({
    locationId: formData.get("locationId"),
    zoneId: formData.get("zoneId") ?? "",
  });
  if (!parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({ zone_id: parsed.data.zoneId || null, updated_by: session.userId })
    .eq("id", parsed.data.locationId);
  if (error) return { error: error.message };

  revalidatePath("/locations");
  return {};
}

// ---------------------------------------------------------------------------
// Tarifas (§4, §5, §6)
// ---------------------------------------------------------------------------

const rateSchema = z.object({
  zoneId: z.string().uuid("Elegí la zona"),
  clientId: z.string().uuid().optional().or(z.literal("")),
  price: z.coerce.number().positive("El precio base debe ser mayor a 0"),
  retryPrice: z.coerce.number().nonnegative().optional(),
  returnPrice: z.coerce.number().nonnegative().optional(),
  reschedulePrice: z.coerce.number().nonnegative().optional(),
  additionalPackagePrice: z.coerce.number().nonnegative().optional(),
  validFrom: z.string().min(10, "Indicá la vigencia desde"),
});

export async function createRateAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);
  const parsed = rateSchema.safeParse({
    zoneId: formData.get("zoneId"),
    clientId: formData.get("clientId") ?? "",
    price: formData.get("price"),
    retryPrice: formData.get("retryPrice") || undefined,
    returnPrice: formData.get("returnPrice") || undefined,
    reschedulePrice: formData.get("reschedulePrice") || undefined,
    additionalPackagePrice: formData.get("additionalPackagePrice") || undefined,
    validFrom: formData.get("validFrom"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const table = parsed.data.clientId ? "client_zone_rates" : "zone_rates";
  const dayBefore = new Date(`${parsed.data.validFrom}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

  // Cerrar la vigencia de la tarifa anterior (historial de precios, §5)
  let closeQuery = supabase
    .from(table)
    .update({ valid_to: dayBefore.toISOString().slice(0, 10) })
    .eq("organization_id", session.organization.id)
    .eq("zone_id", parsed.data.zoneId)
    .is("valid_to", null)
    .lt("valid_from", parsed.data.validFrom);
  if (parsed.data.clientId) closeQuery = closeQuery.eq("client_id", parsed.data.clientId);
  await closeQuery;

  const { error } = await supabase.from(table).insert({
    organization_id: session.organization.id,
    ...(parsed.data.clientId ? { client_id: parsed.data.clientId } : {}),
    zone_id: parsed.data.zoneId,
    price: parsed.data.price,
    retry_price: parsed.data.retryPrice ?? null,
    return_price: parsed.data.returnPrice ?? null,
    reschedule_price: parsed.data.reschedulePrice ?? null,
    additional_package_price: parsed.data.additionalPackagePrice ?? null,
    valid_from: parsed.data.validFrom,
    created_by: session.userId,
  });
  if (error) return { error: `No se pudo crear la tarifa: ${error.message}` };

  revalidatePath("/rates");
  return {};
}

const ruleSchema = z.object({
  ruleKey: z.string().min(1),
  charge: z.enum(["full", "fixed", "percent", "none", "review"]),
  fixedAmount: z.coerce.number().nonnegative().optional(),
  percent: z.coerce.number().min(0).max(100).optional(),
});

export async function updateBillingRuleAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);
  const parsed = ruleSchema.safeParse({
    ruleKey: formData.get("ruleKey"),
    charge: formData.get("charge"),
    fixedAmount: formData.get("fixedAmount") || undefined,
    percent: formData.get("percent") || undefined,
  });
  if (!parsed.success) return { error: "Datos de regla inválidos" };
  if (parsed.data.charge === "fixed" && parsed.data.fixedAmount === undefined) {
    return { error: "Indicá el importe fijo" };
  }
  if (parsed.data.charge === "percent" && parsed.data.percent === undefined) {
    return { error: "Indicá el porcentaje" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("billing_rules").upsert(
    {
      organization_id: session.organization.id,
      applies_to: "status",
      rule_key: parsed.data.ruleKey,
      charge: parsed.data.charge,
      fixed_amount: parsed.data.charge === "fixed" ? parsed.data.fixedAmount : null,
      percent: parsed.data.charge === "percent" ? parsed.data.percent : null,
      updated_by: session.userId,
    },
    { onConflict: "organization_id,applies_to,rule_key" }
  );
  if (error) return { error: error.message };

  revalidatePath("/rates");
  return {};
}

const retryModeSchema = z.object({
  clientId: z.string().uuid(),
  mode: z.enum(["final_only", "plus_retry", "per_visit"]),
});

export async function setClientRetryModeAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole(["owner", "admin"]);
  const parsed = retryModeSchema.safeParse({
    clientId: formData.get("clientId"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { error: "Datos inválidos" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ retry_billing_mode: parsed.data.mode })
    .eq("id", parsed.data.clientId);
  if (error) return { error: error.message };

  revalidatePath("/rates");
  return {};
}

// ---------------------------------------------------------------------------
// Liquidaciones (§13–§20)
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  clientId: z.string().uuid("Elegí el cliente"),
  week: z.string().min(10, "Elegí la semana"),
});

export async function generateSettlementAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);
  const parsed = generateSchema.safeParse({
    clientId: formData.get("clientId"),
    week: formData.get("week"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const weekStart = toDateString(getWeekStart(new Date(`${parsed.data.week}T00:00:00`)));

  let settlementId: string;
  try {
    const result = await generateWeeklySettlement({
      organizationId: session.organization.id,
      clientId: parsed.data.clientId,
      weekStart,
      userId: session.userId,
    });
    settlementId = result.settlementId;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando la liquidación" };
  }

  redirect(`/settlements/${settlementId}`);
}

const adjustmentSchema = z.object({
  settlementId: z.string().uuid(),
  adjType: z.enum([
    "discount", "surcharge", "bonus", "correction", "special_trip",
    "wait", "toll", "extra_pickup", "other",
  ]),
  description: z.string().min(2, "Ingresá la descripción"),
  amount: z.coerce.number().refine((n) => n !== 0, "El importe no puede ser 0"),
  reason: z.string().min(2, "Indicá el motivo del ajuste"),
});

export async function addAdjustmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);
  const parsed = adjustmentSchema.safeParse({
    settlementId: formData.get("settlementId"),
    adjType: formData.get("adjType"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: settlement } = await supabase
    .from("weekly_settlements")
    .select("id, status, organization_id")
    .eq("id", parsed.data.settlementId)
    .maybeSingle();
  if (!settlement) return { error: "Liquidación no encontrada" };
  if (["paid", "void"].includes(settlement.status)) {
    return { error: "La liquidación ya está cerrada" };
  }

  // Descuentos/bonificaciones restan; el resto suma
  const sign = ["discount", "bonus"].includes(parsed.data.adjType) ? -1 : 1;
  const amount = sign * Math.abs(parsed.data.amount);

  const { error } = await supabase.from("weekly_settlement_adjustments").insert({
    settlement_id: settlement.id,
    adj_type: parsed.data.adjType,
    description: parsed.data.description,
    amount,
    reason: parsed.data.reason,
    created_by: session.userId,
  });
  if (error) return { error: error.message };

  await refreshSettlementTotals(settlement.id);

  await supabase.from("audit_logs").insert({
    organization_id: settlement.organization_id,
    user_id: session.userId,
    action: "settlement.adjustment_added",
    resource_type: "weekly_settlement",
    resource_id: settlement.id,
    new_data: { type: parsed.data.adjType, amount, reason: parsed.data.reason },
  });

  revalidatePath(`/settlements/${settlement.id}`);
  return {};
}

const transitionSchema = z.object({
  settlementId: z.string().uuid(),
  action: z.enum(["confirm", "send", "mark_paid", "void"]),
});

export async function settlementTransitionAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole(["owner", "admin"]);
  const parsed = transitionSchema.safeParse({
    settlementId: formData.get("settlementId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return { error: "Acción inválida" };

  const supabase = await createClient();
  const { data: s } = await supabase
    .from("weekly_settlements")
    .select("id, status, validation_issues, organization_id")
    .eq("id", parsed.data.settlementId)
    .maybeSingle();
  if (!s) return { error: "Liquidación no encontrada" };

  const issues = (s.validation_issues ?? []) as unknown[];
  let update: Record<string, unknown>;

  switch (parsed.data.action) {
    case "confirm":
      if (!["draft", "pending_review", "reviewed"].includes(s.status)) {
        return { error: `No se puede confirmar desde el estado "${s.status}"` };
      }
      // §19: no confirmar con problemas pendientes
      if (issues.length > 0) {
        return {
          error:
            "No se puede confirmar: hay problemas de validación pendientes. Corregilos y regenerá la liquidación.",
        };
      }
      update = { status: "confirmed", confirmed_by: session.userId, confirmed_at: new Date().toISOString() };
      break;
    case "send":
      if (s.status !== "confirmed") return { error: "Primero confirmá la liquidación" };
      update = { status: "sent", sent_at: new Date().toISOString() };
      break;
    case "mark_paid":
      if (!["sent", "confirmed", "partially_paid", "overdue"].includes(s.status)) {
        return { error: "La liquidación no está en un estado cobrable" };
      }
      update = { status: "paid", paid_at: new Date().toISOString() };
      break;
    case "void":
      update = { status: "void" };
      break;
  }

  const { error } = await supabase.from("weekly_settlements").update(update).eq("id", s.id);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: s.organization_id,
    user_id: session.userId,
    action: `settlement.${parsed.data.action}`,
    resource_type: "weekly_settlement",
    resource_id: s.id,
    old_data: { status: s.status },
    new_data: update,
  });

  revalidatePath(`/settlements/${s.id}`);
  revalidatePath("/settlements");
  return {};
}
