/**
 * FlexControl — PRUEBA TÉCNICA OBLIGATORIA de etiquetas Flex (§3 del spec)
 *
 * Verifica contra la API REAL de Mercado Libre (sin scraping ni navegador):
 *  1-2. Token válido → identidad del vendedor (/users/me)
 *  3.   Órdenes del vendedor (/orders/search)
 *  4.   Envío relacionado (/shipments/{id})
 *  5.   Señales Flex (logistic_type / tags / mode)
 *  6-7. Localidad, estado y subestado
 *  8-9. Recurso de etiqueta y formato devuelto (PDF / ZPL / ZIP)
 *  10.  Permisos requeridos (errores 401/403)
 *  11.  Segunda descarga de la misma etiqueta
 *  12.  Etiqueta de un envío cancelado (si se indica CANCELLED_SHIPMENT_ID)
 *  15.  Errores devueltos por ML
 *
 * Uso (con un access token vigente de una cuenta vendedora con Flex):
 *   ML_ACCESS_TOKEN=APP_USR-... node scripts/poc-labels.mjs
 *   ML_ACCESS_TOKEN=... SHIPMENT_ID=44... CANCELLED_SHIPMENT_ID=44... node scripts/poc-labels.mjs
 *
 * Escribe los resultados en docs/poc-labels-result.md (anonimizar antes de
 * commitear). Los puntos 13 (regeneración) y 14 (packs multi-producto) se
 * completan a mano repitiendo el script sobre los envíos correspondientes.
 */

import { writeFileSync } from "node:fs";

const API = "https://api.mercadolibre.com";
const token = process.env.ML_ACCESS_TOKEN;
const results = [];

function log(step, ok, detail) {
  const line = `${ok ? "✔" : "✖"} ${step}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  results.push(`- ${line}`);
}

async function ml(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
  return res;
}

async function fetchLabel(shipmentId, responseType) {
  const res = await ml(
    `/shipment_labels?shipment_ids=${shipmentId}&response_type=${responseType}`
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body: body.slice(0, 300) };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 4).toString("latin1");
  const kind =
    head === "%PDF" ? "PDF" : head.startsWith("PK") ? "ZIP" : head.startsWith("^XA") ? "ZPL" : "desconocido";
  return {
    ok: true,
    contentType: res.headers.get("content-type"),
    bytes: buf.byteLength,
    kind,
  };
}

async function main() {
  if (!token) {
    console.error(
      "✖ Falta ML_ACCESS_TOKEN.\n" +
        "  Generá un token real: conectá una cuenta vendedora por OAuth con tu app\n" +
        "  de developers.mercadolibre.com.ar y pasalo como variable de entorno.\n" +
        "  Este script NO usa usuario/contraseña ni scraping."
    );
    process.exit(1);
  }

  // 1-2. Identidad
  const meRes = await ml("/users/me");
  if (!meRes.ok) {
    log("1-2. Identidad del vendedor", false, `HTTP ${meRes.status} — token inválido o vencido`);
    finish();
    return;
  }
  const me = await meRes.json();
  log("1-2. Identidad del vendedor", true, `user_id=${me.id} site=${me.site_id} nick=${me.nickname}`);

  // 3. Órdenes
  const ordersRes = await ml(`/orders/search?seller=${me.id}&sort=date_desc&limit=5`);
  let shipmentId = process.env.SHIPMENT_ID ?? null;
  if (ordersRes.ok) {
    const orders = await ordersRes.json();
    log("3. Búsqueda de órdenes", true, `total=${orders.paging?.total}`);
    if (!shipmentId) {
      const withShipping = (orders.results ?? []).find((o) => o.shipping?.id);
      shipmentId = withShipping?.shipping?.id ?? null;
    }
  } else {
    log("3. Búsqueda de órdenes", false, `HTTP ${ordersRes.status}: ${(await ordersRes.text()).slice(0, 200)}`);
  }

  if (!shipmentId) {
    log("4-15. Resto de la prueba", false, "Sin envío disponible (pasar SHIPMENT_ID=...)");
    finish();
    return;
  }

  // 4-7. Envío, Flex, localidad, estados
  const shipRes = await ml(`/shipments/${shipmentId}`, { headers: { "x-format-new": "true" } });
  if (shipRes.ok) {
    const s = await shipRes.json();
    log("4. Envío obtenido", true, `id=${s.id}`);
    log(
      "5. Señales Flex",
      s.logistic_type !== undefined || s.tags !== undefined,
      `logistic_type=${s.logistic_type} mode=${s.mode} tags=${JSON.stringify(s.tags ?? []).slice(0, 120)}`
    );
    log(
      "6. Localidad",
      !!s.receiver_address,
      `city=${s.receiver_address?.city?.name} state=${s.receiver_address?.state?.name} zip=${s.receiver_address?.zip_code}`
    );
    log("7. Estado y subestado", true, `status=${s.status} substatus=${s.substatus}`);
  } else {
    log("4. Envío obtenido", false, `HTTP ${shipRes.status}: ${(await shipRes.text()).slice(0, 200)}`);
  }

  // 8-10. Etiqueta PDF
  const pdf = await fetchLabel(shipmentId, "pdf");
  if (pdf.ok) {
    log("8-9. Etiqueta (response_type=pdf)", true, `${pdf.kind}, ${pdf.bytes} bytes, content-type=${pdf.contentType}`);
  } else {
    log(
      "8-10. Etiqueta (response_type=pdf)",
      false,
      `HTTP ${pdf.status} → ${pdf.status === 401 || pdf.status === 403 ? "PERMISOS INSUFICIENTES para la app/token" : pdf.body}`
    );
  }

  // 9b. Etiqueta ZPL
  const zpl = await fetchLabel(shipmentId, "zpl2");
  log(
    "9b. Etiqueta (response_type=zpl2)",
    zpl.ok,
    zpl.ok ? `${zpl.kind}, ${zpl.bytes} bytes` : `HTTP ${zpl.status}`
  );

  // 11. Segunda descarga
  if (pdf.ok) {
    const again = await fetchLabel(shipmentId, "pdf");
    log("11. Segunda descarga de la misma etiqueta", again.ok, again.ok ? `${again.bytes} bytes` : `HTTP ${again.status}`);
  }

  // 12. Envío cancelado
  const cancelledId = process.env.CANCELLED_SHIPMENT_ID;
  if (cancelledId) {
    const c = await fetchLabel(cancelledId, "pdf");
    log(
      "12. Etiqueta de envío cancelado",
      true,
      c.ok ? `⚠ ML SÍ la devolvió (${c.bytes} bytes)` : `ML respondió HTTP ${c.status}: ${c.body}`
    );
  } else {
    log("12. Etiqueta de envío cancelado", false, "No probado (pasar CANCELLED_SHIPMENT_ID=...)");
  }

  results.push(
    "",
    "Pendientes manuales: 13 (¿la etiqueta regenerada reemplaza a la anterior?) y",
    "14 (¿un pack multi-producto genera una o varias etiquetas?) — repetir el script",
    "sobre esos envíos y anotar el resultado."
  );
  finish();
}

function finish() {
  const md = `# Resultado de la prueba técnica de etiquetas\n\nFecha: ${new Date().toISOString()}\n\n${results.join("\n")}\n`;
  writeFileSync("docs/poc-labels-result.md", md);
  console.log("\nResultados guardados en docs/poc-labels-result.md (anonimizar antes de commitear).");
}

main().catch((err) => {
  console.error("✖ Error inesperado:", err.message ?? err);
  process.exit(1);
});
