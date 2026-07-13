"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { hasPermission, shipmentInScope } from "@/lib/auth/require-permission";
import type { ActionResult } from "@/lib/auth/actions";
import { ISSUE_TYPES } from "@/lib/labels/issue-types";

/**
 * ShippingLabelIssueService (actions) — tickets de problemas de etiquetas
 * (§18). Todo validado en backend: permiso + alcance del envío.
 */

const reportSchema = z.object({
  shipmentId: z.string().uuid(),
  issueType: z.enum([
    "wont_open", "cancelled", "wrong_package", "address_mismatch",
    "duplicated", "reprint", "ml_not_returning", "other",
  ]),
  description: z.string().optional(),
});

export async function reportLabelIssueAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await hasPermission(session, "labels.report_issue"))) {
    return { error: "No tenés permiso para reportar problemas" };
  }

  const parsed = reportSchema.safeParse({
    shipmentId: formData.get("shipmentId"),
    issueType: formData.get("issueType"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: "Completá el tipo de problema" };
  if (parsed.data.issueType === "other" && !parsed.data.description) {
    return { error: "Describí el problema" };
  }

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, organization_id, client_id, connection_id, driver_id, external_order_id")
    .eq("id", parsed.data.shipmentId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!shipment || !shipmentInScope(session, shipment)) {
    return { error: "Envío fuera de tu alcance" };
  }

  const { data: label } = await supabase
    .from("shipping_labels")
    .select("id")
    .eq("shipment_id", shipment.id)
    .maybeSingle();

  const { error } = await supabase.from("shipping_label_issues").insert({
    organization_id: shipment.organization_id,
    client_id: shipment.client_id,
    connection_id: shipment.connection_id,
    shipment_id: shipment.id,
    label_id: label?.id ?? null,
    external_order_id: shipment.external_order_id,
    issue_type: parsed.data.issueType,
    description: parsed.data.description ?? null,
    reported_by: session.userId,
    priority: parsed.data.issueType === "ml_not_returning" ? "high" : "normal",
  });
  if (error) return { error: `No se pudo crear el reporte: ${error.message}` };

  // Alerta interna para los administradores (§19)
  await supabase.from("notifications").insert({
    organization_id: shipment.organization_id,
    type: "label_issue",
    title: "Problema de etiqueta reportado",
    body: `${ISSUE_TYPES[parsed.data.issueType]} — envío ${shipment.external_order_id ?? shipment.id.slice(0, 8)}`,
    href: "/label-issues",
  });

  revalidatePath("/label-issues");
  revalidatePath("/seller");
  return {};
}

const transitionSchema = z.object({
  issueId: z.string().uuid(),
  status: z.enum(["in_review", "waiting_ml", "resolved", "closed", "not_resolvable"]),
  resolution: z.string().optional(),
});

export async function labelIssueTransitionAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await hasPermission(session, "labels.manage"))) {
    return { error: "No tenés permiso para gestionar tickets" };
  }

  const parsed = transitionSchema.safeParse({
    issueId: formData.get("issueId"),
    status: formData.get("status"),
    resolution: formData.get("resolution") || undefined,
  });
  if (!parsed.success) return { error: "Datos inválidos" };
  if (
    ["resolved", "closed", "not_resolvable"].includes(parsed.data.status) &&
    !parsed.data.resolution
  ) {
    return { error: "Indicá la resolución para cerrar el ticket" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shipping_label_issues")
    .update({
      status: parsed.data.status,
      assignee: session.userId,
      resolution: parsed.data.resolution ?? null,
      resolved_at: ["resolved", "closed", "not_resolvable"].includes(parsed.data.status)
        ? new Date().toISOString()
        : null,
    })
    .eq("id", parsed.data.issueId)
    .eq("organization_id", session.organization.id);
  if (error) return { error: error.message };

  revalidatePath("/label-issues");
  return {};
}
