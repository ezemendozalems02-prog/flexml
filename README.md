# FlexControl

**Gestión inteligente de entregas Flex para transportistas.**

Plataforma SaaS multi-tenant para empresas transportistas que operan entregas de
Mercado Envíos Flex para múltiples vendedores de Mercado Libre: sincroniza envíos
por cuenta, los clasifica por zona, los asigna a repartidores (con PWA móvil) y
genera reportes semanales por cliente y cuenta.

> El nombre del producto está centralizado en [`src/config/branding.ts`](src/config/branding.ts).

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS** — frontend y backend (Server Actions + Route Handlers).
- **Supabase** — PostgreSQL con Row Level Security, Auth y Storage.
- **Vercel** — hosting (plan Hobby; Cron para jobs programados queda deshabilitado por ahora, ver más abajo).
- **Mercado Libre API** — OAuth 2.0, órdenes, envíos y notificaciones (con adaptador **mock** para desarrollar sin credenciales).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Arquitectura, módulos, modelo de datos, flujos, plan por etapas, riesgos y supuestos |
| [`docs/PENDIENTES-VALIDACION.md`](docs/PENDIENTES-VALIDACION.md) | Qué falta validar contra la API real de Mercado Libre antes de producción |
| [`supabase/migrations/`](supabase/migrations/) | Esquema SQL completo (tenancy, operación, RLS, índices) |
| [`supabase/seed/demo.sql`](supabase/seed/demo.sql) | Datos de demostración (org demo, 3 clientes, 5 repartidores, 5 zonas, 50 envíos) |

## Instalación local

1. **Dependencias**

   ```bash
   npm install
   ```

2. **Supabase**

   Crear un proyecto en [supabase.com](https://supabase.com) y ejecutar las
   migraciones en orden desde el SQL Editor (o con `supabase db push` si usás la CLI):

   ```
   supabase/migrations/0001_foundations.sql
   supabase/migrations/0002_operations.sql
   supabase/migrations/0003_billing.sql
   ```

   Opcional (demo): ejecutar `supabase/seed/demo.sql` + `supabase/seed/demo_billing.sql`
   y vincular tu usuario con el bloque comentado al final de `demo.sql`.

3. **Variables de entorno**

   ```bash
   cp .env.example .env.local
   ```

   Completar Supabase URL/keys y generar la clave de cifrado:

   ```bash
   openssl rand -base64 32   # → ENCRYPTION_KEY
   ```

   Para desarrollar **sin** credenciales de Mercado Libre dejar
   `MERCADOLIBRE_USE_MOCK=true` (el botón "Conectar Mercado Libre" crea una
   cuenta simulada con envíos de prueba, marcada `is_mock`).

4. **Usuarios de prueba** (opcional)

   Con las credenciales reales cargadas en `.env.local` (incluida
   `SUPABASE_SERVICE_ROLE_KEY`):

   ```bash
   npm run seed:users
   ```

   Crea 5 usuarios (contraseña `FlexControl2026!` para todos) vinculados a la
   organización demo:

   | Correo | Rol |
   |---|---|
   | `dueno@flexcontrol.test` | Propietario |
   | `admin@flexcontrol.test` | Administrador |
   | `operador@flexcontrol.test` | Operador |
   | `repartidor@flexcontrol.test` | Repartidor (vinculado a Juan Pérez, entra a `/driver`) |
   | `comercio@flexcontrol.test` | Comercio (vinculado al primer cliente) |

   Es idempotente: se puede volver a correr sin duplicar nada. Solo para
   desarrollo/demo.

5. **Correr**

   ```bash
   npm run dev      # http://localhost:3000
   npm test         # pruebas unitarias (vitest)
   npm run build    # build de producción
   ```

## Flujo MVP

1. Registrarse → crear la empresa transportista (onboarding).
2. Crear un cliente (comercio) en **Clientes**.
3. **Conectar Mercado Libre** desde Clientes o Cuentas ML (OAuth; en mock es instantáneo).
4. La sincronización importa órdenes + envíos, clasifica **Flex** (`isFlexShipment`) y asigna **zona** por código postal/localidad.
5. Asignar repartidor desde el detalle del envío.
6. El repartidor entra a `/driver` desde el celular (PWA instalable): ve sus entregas, abre Google Maps, marca **Entregado** o registra **incidencia/reprogramación** con ubicación.
7. **Reportes** genera el resumen semanal por cliente/cuenta con export CSV.

## Etiquetas Flex, autoservicio y permisos

- **Etiquetas Flex** (`/labels` para el staff): búsqueda por ID de venta/envío/pack, estado de etiqueta (disponible, descargada, impresa, reemplazada, no disponible, acceso no autorizado…), contador de descargas y acciones Ver / Descargar / Imprimir / Actualizar desde ML / Copiar IDs. La etiqueta se descarga **desde el backend** con la conexión OAuth (el token nunca llega al navegador), se guarda en un **bucket privado** de Supabase Storage con **URLs firmadas temporales**, con hash y versiones para detectar reemplazos, y **cada acceso queda auditado** (usuario, acción, IP). Crear el bucket es automático; se llama `shipping-labels`.
- **Portal del vendedor** (`/seller`): buscador grande, contadores del día, estado + localidad + zona de cada envío, etiqueta y reporte de problemas. **Nunca muestra precios ni liquidaciones.**
- **Centro de problemas** (`/label-issues`): los reportes de vendedores/repartidores se convierten en tickets (nuevo → en revisión → esperando ML → resuelto/no resoluble) en lugar de mensajes por WhatsApp; el admin recibe notificación.
- **Permisos granulares**: matriz por rol (`src/lib/auth/permissions.ts`) + overrides por usuario (`user_permissions`), validados **en el backend** (route handlers y actions) además de RLS por rol en la base: el vendedor solo ve su comercio, el repartidor solo lo asignado, y las tablas financieras solo owner/admin.
- ⚠️ **Prueba técnica obligatoria antes de producción**: `node scripts/poc-labels.mjs` con un token real valida el recurso de etiquetas de ML punto por punto (ver `docs/PENDIENTES-VALIDACION.md`). Sin scraping, sin credenciales compartidas, sin cookies de ML.

## Módulo de tarifas y liquidación semanal

- **Localidades** (`/locations`): cada localidad pertenece a una zona; alias resuelven variantes de escritura ("Gral. San Martín" ≈ "General San Martín"). Alerta de "localidades sin clasificar" detectadas en envíos; al crear la regla se reutiliza para siempre.
- **Tarifas** (`/rates`): precio base + reintento + devolución + paquete adicional por zona, con **vigencia histórica** (un envío del 28/07 se calcula con la tarifa de ese día). Tarifas personalizadas por cliente pisan la general. Reglas de cobro por estado (100% / fijo / porcentaje / no cobrable / revisión) y modalidad de reintentos por cliente (solo final / +1 reintento / por visita).
- **Precio congelado**: cada envío guarda su cálculo en `shipment_rate_calculations` con desglose auditable; los cambios futuros de precio nunca alteran semanas anteriores. Las correcciones manuales requieren motivo y quedan en auditoría.
- **Liquidaciones** (`/settlements`): genera el borrador semanal por cliente con resumen por cuenta de ML y por zona (cantidad × precio unitario = subtotal), adicionales, ajustes manuales (con motivo obligatorio), validaciones bloqueantes antes de confirmar, estados (borrador → confirmada → enviada → pagada), export CSV/Excel, vista imprimible (PDF vía imprimir) y **mensaje listo para WhatsApp**.

## Procesos programados (deshabilitados por ahora)

> ⚠️ **Vercel Cron está deshabilitado durante el desarrollo** (el plan Hobby solo
> permite ejecuciones diarias, y este proyecto no lo necesita todavía). `vercel.json`
> no declara `crons`. Los endpoints siguen existiendo y funcionan igual si se
> disparan a mano o desde un scheduler externo:

| Ruta | Función |
|---|---|
| `/api/cron/sync` | Procesa notificaciones del webhook, jobs encolados y sync incremental |
| `/api/cron/refresh-tokens` | Renueva tokens próximos a vencer (lock anti-concurrencia; ante fallo → `needs_reauth`) |

Ambos requieren header `Authorization: Bearer $CRON_SECRET`. Mientras no haya cron
automático, se pueden invocar manualmente (`curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/sync`)
o programar desde un servicio externo gratuito (GitHub Actions con `schedule`,
cron-job.org, etc.) apuntando a esa URL. El webhook de Mercado Libre
(`/api/webhooks/mercadolibre`) sigue funcionando en tiempo real de forma
independiente del cron: solo la reconciliación de eventos perdidos y la
renovación proactiva de tokens quedan sin disparo automático hasta reactivar
un cron (Vercel Pro, GitHub Actions, etc.).

## Seguridad

- Tokens de ML cifrados con **AES-256-GCM** en reposo; nunca llegan al navegador.
- **RLS** en todas las tablas: los datos de una transportista jamás se mezclan con otra.
- El flujo OAuth usa `state` de un solo uso con expiración.
- Auditoría en `audit_logs` (conexiones, exportaciones, cambios sensibles).
- Sin contraseñas de Mercado Libre: solo OAuth oficial.

## Estado del proyecto

MVP en construcción por etapas (ver plan en `docs/ARQUITECTURA.md` §8). Implementado:
fundaciones, esquema completo de BD con RLS, auth + onboarding, capa Mercado Libre
(OAuth, tokens cifrados, renovación, sync idempotente, clasificador Flex versionado,
webhook, mock), panel admin (dashboard, envíos con filtros, detalle con historial,
clientes, conexiones, repartidores, zonas, reporte semanal + CSV) y PWA del repartidor
(entrega, incidencias, reprogramación con geolocalización).

Pendiente para las próximas etapas: retiros y escaneo, rutas con mapa, asignación
masiva, cierres semanales versionados, liquidaciones, portal del comercio,
notificaciones internas y correo (Resend). La base de datos ya contempla todos estos
módulos.
