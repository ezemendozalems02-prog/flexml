# Pendientes de validación con Mercado Libre real

Este proyecto incluye un **adaptador mock** (`MERCADOLIBRE_USE_MOCK=true`) que
permite desarrollar y probar todo el flujo sin credenciales. Antes de pasar a
producción hay que validar contra la API real, con una app creada en
[developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar):

## Bloqueantes

1. **Identificación de Flex** (`src/lib/mercadolibre/flex-classifier.ts`)
   - Confirmar que `shipment.logistic_type === "self_service"` sigue siendo el
     indicador vigente de Mercado Envíos Flex.
   - Confirmar los tags reales (`self_service_in` / `self_service_out`).
   - Guardar ejemplos anonimizados de respuestas reales en `docs/samples/`
     (crear la carpeta; no subir datos personales).
   - Ajustar reglas y subir `FLEX_RULE_VERSION` si cambia algo.

2. **Formato de `/shipments/{id}`** (`adapters/http.ts`)
   - Se pide con header `x-format-new: true`. Verificar la forma exacta de
     `receiver_address` (nombres de campos de ciudad/partido/teléfono) y los
     permisos del scope sobre datos del comprador.
   - Los campos no disponibles deben quedar como “No disponible” (ya soportado).

3. **Búsqueda de órdenes** (`/orders/search?seller=...`)
   - Confirmar filtros de fecha (`order.date_created.from/to`), límites de
     paginación y rate limits actuales.

4. **OAuth**
   - Confirmar la URL de autorización por site (hoy `auth.mercadolibre.com.ar`),
     vigencia del access token (~6 h) y del refresh token (uso único, se rota).
   - `offline_access` debe estar habilitado en la app para recibir refresh token.

5. **Webhooks**
   - Configurar la URL pública `/api/webhooks/mercadolibre` en la app de ML.
   - Confirmar tópicos a suscribir (`orders_v2`, `shipments`) y el formato del
     payload (validado con zod en el endpoint; ajustar si difiere).
   - ML espera respuesta HTTP 200 en menos de 500 ms (ya contemplado).

## Etiquetas Flex — PRUEBA TÉCNICA OBLIGATORIA (no cerrar el módulo sin esto)

El módulo de etiquetas usa el recurso documentado
`GET /shipment_labels?shipment_ids={id}&response_type=pdf|zpl2`.
**No se considera resuelto hasta correr la prueba técnica con una cuenta real**
con Mercado Envíos Flex activo y al menos un envío Flex real:

```bash
ML_ACCESS_TOKEN=APP_USR-... node scripts/poc-labels.mjs
# opcional:
ML_ACCESS_TOKEN=... SHIPMENT_ID=44... CANCELLED_SHIPMENT_ID=44... node scripts/poc-labels.mjs
```

El script verifica los 15 puntos del checklist (identidad OAuth, órdenes,
envío, señales Flex, localidad, estados, recurso de etiqueta, formato
PDF/ZPL/ZIP, permisos 401/403, segunda descarga, envío cancelado, errores) y
escribe `docs/poc-labels-result.md`. Los puntos 13 (etiqueta regenerada) y 14
(packs multi-producto) se completan repitiendo el script sobre esos envíos.

Hasta validar: el adaptador mock devuelve un PDF simulado y los envíos
cancelados simulan la falta de etiqueta (404). Nunca se hace scraping, no se
usan credenciales de ML ni cookies de sesión, y si la API no entrega la
etiqueta el sistema lo informa con un mensaje claro y guarda el detalle
técnico para el administrador.

## Cómo pasar de mock a real

1. Crear la app en el DevCenter de Mercado Libre (redirect URI exacta).
2. Completar `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`,
   `MERCADOLIBRE_REDIRECT_URI` en el entorno.
3. Poner `MERCADOLIBRE_USE_MOCK=false`.
4. Conectar una cuenta real de prueba y revisar `marketplace_sync_logs`.
5. Borrar/archivar las conexiones con `is_mock = true` (nunca mezclar datos
   simulados con producción).
