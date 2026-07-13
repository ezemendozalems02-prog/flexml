import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoLibreProvider } from "@/lib/mercadolibre";
import { getValidAccessToken } from "@/lib/mercadolibre/token-service";
import { MLApiError } from "@/lib/mercadolibre/adapters/http";

/**
 * ShippingLabelService — obtención y entrega segura de etiquetas Flex.
 *
 * Flujo (§21): usuario solicita → backend valida permiso y alcance (en la
 * action/route) → caché privada (Supabase Storage, bucket privado) → si falta
 * o se fuerza, se pide a ML desde el servidor (el access token NUNCA viaja al
 * navegador) → se valida tipo y tamaño → URL firmada temporal → acceso
 * registrado en shipping_label_access_logs.
 */

const BUCKET = "shipping-labels";
const SIGNED_URL_TTL_SECONDS = 120;
const MAX_LABEL_BYTES = 10 * 1024 * 1024; // 10 MB

export interface LabelResult {
  ok: true;
  labelId: string;
  signedUrl: string;
  format: string;
  fileName: string;
  version: number;
}

export interface LabelFailure {
  ok: false;
  /** estado interno resultante */
  status: "unavailable" | "unauthorized" | "ml_error" | "cancelled" | "pending";
  /** mensaje simple para el usuario final (§10) */
  userMessage: string;
}

export type LabelOutcome = LabelResult | LabelFailure;

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: false });
  }
}

/**
 * Devuelve una URL firmada de la etiqueta, obteniéndola de ML si hace falta.
 * No lanza ante fallas "esperables": devuelve LabelFailure con mensaje simple
 * y guarda el detalle técnico para el administrador (§10).
 */
export async function getOrFetchLabel(
  shipmentId: string,
  opts: { force?: boolean; userId?: string } = {}
): Promise<LabelOutcome> {
  const admin = createAdminClient();

  const { data: shipment } = await admin
    .from("shipments")
    .select(
      "id, organization_id, client_id, connection_id, external_shipment_id, external_status, internal_status, is_flex"
    )
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) {
    return { ok: false, status: "unavailable", userMessage: "Envío no encontrado." };
  }

  const { data: existing } = await admin
    .from("shipping_labels")
    .select("*")
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  // Caché privada vigente
  if (
    existing?.storage_path &&
    !opts.force &&
    ["available", "downloaded", "printed", "reprinted"].includes(existing.internal_status)
  ) {
    const url = await signUrl(existing.storage_path);
    if (url) {
      return {
        ok: true,
        labelId: existing.id,
        signedUrl: url,
        format: existing.format ?? "pdf",
        fileName: existing.file_name ?? `etiqueta-${shipment.external_shipment_id}.pdf`,
        version: existing.version,
      };
    }
  }

  if (!shipment.connection_id || !shipment.external_shipment_id) {
    await upsertLabel(shipment, existing, { internal_status: "unavailable", last_error: "Envío sin conexión de ML o sin ID externo" });
    return {
      ok: false,
      status: "unavailable",
      userMessage: "Este envío no tiene una cuenta de Mercado Libre asociada.",
    };
  }

  // Marcar en actualización
  const labelRow = await upsertLabel(shipment, existing, { internal_status: "refreshing" });

  try {
    const accessToken = await getValidAccessToken(shipment.connection_id);
    const provider = getMercadoLibreProvider();
    const file = await provider.getShipmentLabel(
      { accessToken },
      shipment.external_shipment_id
    );

    // Validaciones de contenido (§9)
    if (file.byteLength === 0 || file.byteLength > MAX_LABEL_BYTES) {
      throw new Error(`Tamaño de archivo inválido: ${file.byteLength} bytes`);
    }

    const buffer = Buffer.from(file.base64, "base64");
    const hash = createHash("sha256").update(buffer).digest("hex");

    // ¿Reemplazo? (hash distinto al anterior)
    const isReplacement = !!existing?.file_hash && existing.file_hash !== hash;
    const version = isReplacement ? (existing?.version ?? 1) + 1 : existing?.version ?? 1;
    const ext = file.format === "zip" ? "zip" : file.format === "zpl" ? "txt" : "pdf";
    const fileName = `etiqueta-${shipment.external_shipment_id}-v${version}.${ext}`;
    const storagePath = `${shipment.organization_id}/${shipment.id}/v${version}.${ext}`;

    await ensureBucket();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.contentType, upsert: true });
    if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

    if (isReplacement && existing) {
      await admin.from("shipping_label_versions").insert({
        label_id: labelRow.id,
        version: existing.version,
        storage_path: existing.storage_path,
        file_hash: existing.file_hash,
        format: existing.format,
        replaced_reason: "Etiqueta regenerada en Mercado Libre (hash distinto)",
        created_by: opts.userId ?? null,
      });
    }

    await admin
      .from("shipping_labels")
      .update({
        internal_status: isReplacement ? "replaced" : "available",
        external_status: shipment.external_status,
        format: file.format,
        file_name: fileName,
        storage_path: storagePath,
        file_hash: hash,
        file_size: file.byteLength,
        generated_at: new Date().toISOString(),
        version,
        last_error: null,
        retry_count: 0,
        requires_review: false,
      })
      .eq("id", labelRow.id);

    // Tras un reemplazo, la nueva queda disponible
    if (isReplacement) {
      await admin
        .from("shipping_labels")
        .update({ internal_status: "available" })
        .eq("id", labelRow.id);
    }

    const url = await signUrl(storagePath);
    if (!url) throw new Error("No se pudo firmar la URL del archivo");

    return { ok: true, labelId: labelRow.id, signedUrl: url, format: file.format, fileName, version };
  } catch (err) {
    return await handleFetchError(shipment, labelRow.id, err);
  }
}

async function handleFetchError(
  shipment: { id: string; organization_id: string; connection_id: string | null },
  labelId: string,
  err: unknown
): Promise<LabelFailure> {
  const admin = createAdminClient();
  const message = err instanceof Error ? err.message : String(err);

  let internal: "unavailable" | "unauthorized" | "ml_error" = "ml_error";
  let userMessage =
    "Mercado Libre devolvió un error al pedir la etiqueta. Reintentá en unos minutos o solicitá revisión.";
  let httpStatus: number | null = null;

  if (err instanceof MLApiError) {
    httpStatus = err.status;
    if (err.isAuthError) {
      internal = "unauthorized";
      userMessage =
        "La cuenta está conectada, pero Mercado Libre no autorizó el acceso a esta etiqueta mediante la integración. Podés solicitar revisión al administrador.";
    } else if (err.status === 404) {
      internal = "unavailable";
      userMessage =
        "La cuenta está conectada y el envío fue encontrado, pero Mercado Libre no entregó la etiqueta mediante el recurso disponible (puede estar cancelada o vencida). Podés solicitar revisión.";
    }
  }

  // Detalle técnico para el administrador; mensaje simple para el usuario (§10)
  await admin.from("shipping_label_errors").insert({
    label_id: labelId,
    shipment_id: shipment.id,
    connection_id: shipment.connection_id,
    http_status: httpStatus,
    message,
  });

  const { data: current } = await admin
    .from("shipping_labels")
    .select("retry_count")
    .eq("id", labelId)
    .single();

  await admin
    .from("shipping_labels")
    .update({
      internal_status: internal,
      last_error: message.slice(0, 500),
      retry_count: (current?.retry_count ?? 0) + 1,
      requires_review: internal !== "ml_error",
    })
    .eq("id", labelId);

  // Alerta para administradores (§19)
  await admin.from("notifications").insert({
    organization_id: shipment.organization_id,
    type: "label_error",
    title: "Etiqueta no disponible",
    body: `No se pudo obtener la etiqueta del envío ${shipment.id.slice(0, 8)} (${internal}).`,
    href: "/labels",
  });

  return { ok: false, status: internal, userMessage };
}

async function upsertLabel(
  shipment: {
    id: string;
    organization_id: string;
    client_id: string;
    connection_id: string | null;
    external_shipment_id: string | null;
    external_status: string | null;
  },
  existing: { id: string } | null,
  patch: Record<string, unknown>
): Promise<{ id: string }> {
  const admin = createAdminClient();
  if (existing) {
    await admin.from("shipping_labels").update(patch).eq("id", existing.id);
    return existing;
  }
  const { data, error } = await admin
    .from("shipping_labels")
    .insert({
      organization_id: shipment.organization_id,
      client_id: shipment.client_id,
      connection_id: shipment.connection_id,
      shipment_id: shipment.id,
      external_shipment_id: shipment.external_shipment_id,
      external_status: shipment.external_status,
      ...patch,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear la etiqueta: ${error?.message}`);
  return data;
}

async function signUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Registro de cada acceso (§8, §9): quién, qué acción, resultado, desde dónde. */
export async function logLabelAccess(params: {
  labelId: string | null;
  shipmentId: string;
  userId: string;
  action: "view" | "download" | "print" | "refresh";
  result: "ok" | "denied" | "error" | "unavailable";
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("shipping_label_access_logs").insert({
    label_id: params.labelId,
    shipment_id: params.shipmentId,
    user_id: params.userId,
    action: params.action,
    result: params.result,
    ip: params.ip ?? null,
    user_agent: params.userAgent?.slice(0, 300) ?? null,
  });

  if (params.result === "ok" && params.labelId) {
    if (params.action === "download" || params.action === "view") {
      const { data } = await admin
        .from("shipping_labels")
        .select("download_count, internal_status")
        .eq("id", params.labelId)
        .single();
      await admin
        .from("shipping_labels")
        .update({
          download_count: (data?.download_count ?? 0) + 1,
          last_downloaded_at: new Date().toISOString(),
          last_downloaded_by: params.userId,
          internal_status:
            data?.internal_status === "available" ? "downloaded" : data?.internal_status,
        })
        .eq("id", params.labelId);
    }
    if (params.action === "print") {
      const { data } = await admin
        .from("shipping_labels")
        .select("print_count")
        .eq("id", params.labelId)
        .single();
      await admin
        .from("shipping_labels")
        .update({
          print_count: (data?.print_count ?? 0) + 1,
          internal_status: (data?.print_count ?? 0) > 0 ? "reprinted" : "printed",
        })
        .eq("id", params.labelId);
    }
  }
}
