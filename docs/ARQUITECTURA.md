# FlexControl — Arquitectura Técnica

> **FlexControl** — Gestión inteligente de entregas Flex para transportistas.
> El nombre está centralizado en `src/config/branding.ts`. Para renombrar el producto, editar únicamente ese archivo.

---

## 1. Visión general

Plataforma SaaS multi-tenant para empresas transportistas que operan entregas de **Mercado Envíos Flex** para múltiples vendedores de Mercado Libre.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (hosting)                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Next.js App Router (TS)                   │ │
│  │                                                             │ │
│  │  /(admin)      Panel web transportista (desktop-first)     │ │
│  │  /(driver)     PWA repartidor (mobile-first, instalable)   │ │
│  │  /(client)     Portal del comercio (fase MVP+)             │ │
│  │  /(auth)       Login / registro / invitaciones             │ │
│  │  /api/webhooks/mercadolibre   Notificaciones ML            │ │
│  │  /api/cron/*   Jobs programados (Vercel Cron)              │ │
│  │  /api/oauth/mercadolibre/*    Flujo OAuth ML                │ │
│  └───────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴───────────────┐
              │           Supabase           │
              │  PostgreSQL + RLS            │
              │  Auth (email, invitaciones)  │
              │  Storage (evidencias, logos) │
              └──────────────┬───────────────┘
                             │
              ┌──────────────┴───────────────┐
              │     API de Mercado Libre     │
              │  OAuth 2.0 / Orders /        │
              │  Shipments / Notifications   │
              └──────────────────────────────┘
```

## 2. Principios

- **TypeScript estricto** en todo el código.
- **Multi-tenant por `organization_id`**: toda tabla operativa referencia la organización; RLS obliga el aislamiento a nivel base de datos, no solo en la aplicación.
- **Capa de servicios de Mercado Libre aislada** (`src/lib/mercadolibre/`): ninguna llamada directa a la API de ML fuera de esta capa. Interfaz de proveedor + adaptador real + adaptador mock para desarrollo sin credenciales.
- **Estados externos e internos separados**: el estado que informa ML nunca se sobreescribe con nombres internos; el estado operativo interno es propio de la transportista. Todo cambio genera un evento en `shipment_events`.
- **Idempotencia**: la sincronización usa IDs externos únicos por conexión (`UNIQUE (connection_id, external_shipment_id)`); el mismo evento nunca duplica envíos.
- **Tokens cifrados**: access/refresh tokens de ML se cifran con AES-256-GCM (`ENCRYPTION_KEY`) antes de persistir. Solo el servidor los descifra. Nunca viajan al navegador.
- **Auditoría**: acciones sensibles registradas en `audit_logs`; sincronizaciones en `marketplace_sync_logs`.
- **Datos incompletos tolerados**: campos opcionales, `data_completeness`, `manually_overridden`, la UI muestra “No disponible” y nunca inventa datos.

## 3. Módulos

| Módulo | Ubicación | Responsabilidad |
|---|---|---|
| Branding | `src/config/branding.ts` | Nombre, subtítulo, colores de marca centralizados |
| Auth & tenancy | `src/lib/auth/`, `src/lib/supabase/` | Sesión, membresías, roles, guards |
| Mercado Libre | `src/lib/mercadolibre/` | OAuth, tokens, órdenes, envíos, notificaciones, sync, clasificación Flex |
| Dominio | `src/lib/domain/` | Tipos, máquina de estados internos, catálogos |
| Zonas | `src/lib/zones/` | Clasificación automática (localidad configurada → CP → localidad → barrio → polígono) |
| Facturación | `src/lib/billing/` | Localidades+alias, tarifas históricas, motor de precios puro, liquidación semanal |
| Reportes | `src/lib/reports/` | Métricas, cierre semanal, export CSV/PDF |
| UI compartida | `src/components/` | Tablas, badges de estado, formularios, layout |

### Capa Mercado Libre (servicios)

```
src/lib/mercadolibre/
  provider.ts                  # Interfaz MercadoLibreProvider (contrato)
  adapters/
    http.ts                    # Adaptador real contra api.mercadolibre.com
    mock.ts                    # Adaptador mock (desarrollo sin credenciales)
  auth-service.ts              # MercadoLibreAuthService  (OAuth, state, callback)
  token-service.ts             # MercadoLibreTokenService (cifrado, renovación con lock)
  orders-service.ts            # MercadoLibreOrdersService
  shipments-service.ts         # MercadoLibreShipmentsService
  notifications-service.ts     # MercadoLibreNotificationsService (webhook intake)
  sync-service.ts              # MercadoLibreSyncService   (orquestación idempotente)
  flex-classifier.ts           # isFlexShipment() — reglas versionadas y configurables
```

**Clasificación Flex** (`flex-classifier.ts`): función centralizada `isFlexShipment(shipmentData)` basada en los campos reales que devuelve la API (`logistic_type`, `tags`, `mode`). La regla es **versionada y configurable**; cada envío guarda tipo logístico original, tags, resultado, motivo y versión de la regla. ⚠️ **Pendiente de validar con una cuenta real y la documentación vigente antes de dar por cerrada la implementación** (ver `docs/PENDIENTES-VALIDACION.md`).

## 4. Modelo de datos

Esquema completo en `supabase/migrations/`. Resumen de dominios:

- **Tenancy**: `organizations`, `organization_settings`, `organization_members`, `roles`, `permissions`, `role_permissions`, `platform_users` (perfil extendido de `auth.users`).
- **Clientes**: `clients`, `client_users`.
- **Mercado Libre**: `marketplace_connections` (tokens cifrados, estado de conexión), `marketplace_token_events`, `marketplace_sync_jobs`, `marketplace_sync_logs`, `marketplace_notifications` (eventos brutos del webhook).
- **Envíos**: `orders`, `order_items`, `shipments` (núcleo), `shipment_addresses`, `shipment_events` (línea de tiempo), `shipment_assignments`, `shipment_attempts`, `shipment_evidence`, `shipment_notes`.
- **Operación**: `zones`, `zone_rules`, `drivers`, `vehicles`, `driver_availability`, `routes`, `route_stops`, `pickup_orders`, `pickup_order_shipments`, `incident_reasons`, `scan_events`.
- **Cierres y liquidaciones**: `weekly_closures`, `weekly_closure_items`, `client_settlements`, `client_settlement_items`, `driver_settlements`, `driver_settlement_items`.
- **Plataforma**: `notifications`, `files`, `audit_logs`.

Reglas clave:
- UUID como PK en todas las tablas.
- `UNIQUE (connection_id, external_shipment_id)` y `UNIQUE (connection_id, external_order_id)` — sin duplicados por conexión.
- Índices por `organization_id`, cliente, fecha, estado interno/externo e IDs externos.
- `deleted_at` (soft delete) en entidades maestras.
- RLS activa en todas las tablas con políticas por membresía de organización.
- Los montos guardan `currency`.

## 5. Estados

### Estado externo (Mercado Libre)
Se guarda **tal cual lo informa la API** en `external_status` / `external_substatus` (texto libre + fecha de última actualización externa). No se traduce ni se pisa.

### Estado operativo interno (`internal_status`)
Enum propio: `imported → pending_classification → pending_pickup → picked_up → at_warehouse → classified → assigned → route_prep → out_for_delivery → visited → delivered | partial_delivery | not_answered | absent | wrong_address | incomplete_address | dangerous_zone | rejected | rescheduled | cancelled_by_ml | cancelled_by_client | returned | pending_return | returned_to_seller | lost | damaged | under_review`.

Todo cambio de cualquiera de los dos estados inserta una fila en `shipment_events` con estado anterior/nuevo, fuente, usuario, ubicación y evidencia. **Nunca se sobreescribe sin historial.** Las divergencias externo/interno se detectan en el módulo de **reconciliación**.

### Módulo de facturación (`src/lib/billing/`)

Flujo: **Localidad → Zona → Tarifa histórica → Regla cobrable → Adicionales → Total del envío → Liquidación semanal.**

- `normalization.ts` — normaliza nombres de localidad (tildes, abreviaturas, "Partido de"); las variantes restantes se resuelven con **alias** por localidad.
- `location-service.ts` — localidad → zona (lookup por nombre normalizado y alias); detecta "Localidad sin clasificar" en envíos.
- `engine.ts` — **motor de precios puro** (sin BD, 100% testeado): elección de tarifa vigente por fecha (`pickApplicableRate`), prioridad cliente > zona (`resolveRate`), reglas de cobro full/fixed/percent/none/review, reintentos por modalidad (solo final / +1 reintento / por visita), devoluciones y paquetes adicionales.
- `shipment-billing.ts` — congela el cálculo en `shipment_rate_calculations` + `shipment_charge_items`. Un cálculo `overridden` (corrección manual) jamás se recalcula. Los cambios futuros de tarifa **no** alteran semanas anteriores.
- `settlement-service.ts` — genera la liquidación semanal por cliente: recalcula pendientes, agrega por cuenta de ML y zona, valida (§19: sin zona, sin precio, revisión, tarifas superpuestas), versiona (`weekly_settlement_versions`) y arma el mensaje de WhatsApp.

Tablas: `locations`, `location_aliases`, `zone_locations` (vista), `zone_rates`, `client_zone_rates`, `billing_rules`, `shipment_rate_calculations`, `shipment_charge_items`, `weekly_settlements`, `weekly_settlement_accounts`, `weekly_settlement_items`, `weekly_settlement_adjustments`, `weekly_settlement_versions`, `payment_records` (migración `0003_billing.sql`).

## 6. Flujos principales

### OAuth Mercado Libre
1. Usuario presiona “Conectar Mercado Libre” → el servidor genera `state` aleatorio y lo persiste (`oauth_states`: state, org, cliente, usuario, expiración).
2. Redirect a la URL de autorización de ML.
3. Callback `/api/oauth/mercadolibre/callback`: valida `state`, intercambia `code` por tokens (server-side), obtiene el usuario vendedor (`/users/me`), cifra y guarda la conexión, encola la sincronización inicial.

### Sincronización
- **Webhook** `/api/webhooks/mercadolibre`: responde 200 rápido, guarda el evento bruto en `marketplace_notifications` con dedupe, lo marca `pending`; un job asíncrono lo procesa.
- **Cron** (`/api/cron/sync`): recupera eventos perdidos, refresca envíos recientes, reconcilia estados, reintenta con backoff. Cada corrida se registra en `marketplace_sync_jobs` (inicio, fin, procesados, exitosos, fallidos, error, duración).
- **Renovación de tokens** (`/api/cron/refresh-tokens`): renueva antes del vencimiento con lock lógico (`refresh_lock_until`) para evitar renovaciones simultáneas; ante fallo irrecuperable marca la conexión `needs_reauth`. *(No existe el “token infinito”: la conexión depende de la autorización vigente de ML.)*

### Flujo del repartidor (PWA)
Login → ruta de hoy → confirmar recepción → “Comenzar recorrido” (hora + ubicación) → por parada: Entregar (receptor, firma, foto, ubicación) / No pude entregar (motivo del catálogo, foto, observación → reintentar / reprogramar / devolver / revisión) → resumen del día → “Finalizar recorrido”.

## 7. Estructura de carpetas

```
flexcontrol/
  docs/                        # esta documentación
  supabase/
    migrations/                # SQL versionado
    seed/                      # datos demo (etiquetados “Modo demostración”)
  public/                      # manifest PWA, íconos
  src/
    config/branding.ts
    app/
      (auth)/login, register, invite/[token]
      (admin)/dashboard, shipments, shipments/[id], map, pickups, routes,
              clients, clients/[id], connections, drivers, vehicles, zones,
              incidents, reports, closures, settlements, users,
              integrations, audit, settings, support
      (driver)/driver, driver/route, driver/shipment/[id], driver/history, driver/profile
      api/oauth/mercadolibre/{start,callback}
      api/webhooks/mercadolibre
      api/cron/{sync,refresh-tokens,reconcile,metrics}
    components/{ui, layout, shipments, drivers, reports}
    lib/
      supabase/{client,server,admin,middleware}.ts
      auth/
      mercadolibre/
      domain/
      zones/
      reports/
      crypto/encryption.ts
  .env.example
```

## 8. Plan de implementación

| Etapa | Contenido | Estado |
|---|---|---|
| 1. Fundaciones | Proyecto, esquema BD + RLS, auth, organizaciones, roles, layout | 🔨 en curso |
| 2. Operación básica | Clientes, repartidores, zonas, envíos, estados, historial, asignaciones | pendiente |
| 3. Mercado Libre | OAuth, tokens cifrados, renovación, sync, webhooks, reconciliación, Flex | pendiente (mock listo desde etapa 1) |
| 4. Repartidor | PWA, ruta, entrega, incidencia, reprogramación, evidencias | pendiente |
| 5. Reportes | Dashboard, cierre semanal, reporte por cliente/cuenta, CSV/PDF | pendiente |
| 6. Calidad | Pruebas, seguridad, rendimiento, auditoría, monitoreo, docs | pendiente |

## 9. Dependencias

- `@supabase/supabase-js`, `@supabase/ssr` — datos y auth.
- `zod` — validación en frontend y backend.
- `lucide-react` — iconografía.
- `date-fns` — fechas y semanas (zona horaria de la organización).
- Export: CSV nativo; XLSX y PDF (`exceljs` / render de impresión + PDF) en etapa 5.
- Mapas: Google Maps o Mapbox (clave por entorno) en etapa 2/4.
- `resend` — correo transaccional (invitaciones, reportes).

## 10. Riesgos técnicos

1. **Identificación de Flex**: el indicador (`logistic_type = "self_service"` según documentación conocida) debe validarse contra una cuenta real; la regla es configurable y versionada por si ML cambia el contrato.
2. **Datos del comprador**: ML restringe datos personales según scopes y estado de la orden; el sistema tolera campos ausentes (minimización de datos).
3. **Rate limits de ML**: sync con paginación, backoff y cola; volumen alto puede requerir worker externo (previsto en arquitectura).
4. **Vercel Cron + funciones**: jobs largos se trocean por lotes con cursor persistido en `marketplace_sync_jobs`.
5. **Webhooks**: ML exige respuesta < 500 ms; el endpoint solo persiste y encola.
6. **RLS y rendimiento**: políticas basadas en membership con índices adecuados; consultas del panel siempre filtradas por organización.

## 11. Supuestos

- Un cliente (comercio) puede tener **varias** cuentas de ML; cada conexión pertenece a exactamente un cliente y una organización.
- La semana operativa es **lunes a domingo** (configurable por organización).
- Moneda por defecto ARS, zona horaria por defecto `America/Argentina/Buenos_Aires` (configurables).
- El portal del comercio (rol cliente) se entrega después del flujo núcleo transportista + repartidor.
- La reprogramación interna **no** modifica nada en Mercado Libre.
