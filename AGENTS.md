# CargaRuta — contexto para agentes

## Qué es

App de logística para camioneros en Venezuela (base Valencia). El objetivo clave es evitar viajes de regreso vacíos: el conductor planifica un viaje, optimiza la carga en 3D y comparte su espacio libre para el retorno. Toda la interfaz y los mensajes están en español (es-VE).

## Stack

- TanStack Start v1 (React 19, Vite, SSR). Rutas en `src/routes`; nunca usar react-router-dom ni App.tsx.
- Tailwind CSS v4 vía `src/styles.css` (tokens semánticos; no hardcodear colores en componentes).
- Backend: Supabase local vía Supabase CLI (`bun run db:start`, requiere podman/docker; `DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock` con podman). Migraciones en `supabase/migrations/`; regenerar tipos con `bun run db:types`. Cliente navegador: `@/integrations/supabase/client`. Lógica de servidor con `createServerFn`; nada de Supabase Edge Functions. Credenciales de dev en `.env` (no committeado; ver `.env.example`).
- 3D: three.js + @react-three/fiber/drei, solo en cliente.
- Tests: vitest (`bunx vitest run`). Typecheck: `bun run typecheck` (`tsc --noEmit`).

## Mapa de la app

- `/` — landing con demo 3D (`src/routes/index.tsx`).
- `/auth` — login/registro (email + Google).
- `/panel` — redirige a `/panel/viajes`. `/panel/viajes` — historial de viajes; `/panel/viajes/nuevo` — formulario de viaje (origen/destino, fecha y hora estimada, vehículo, paquetes); `/panel/viajes/$id` — plan de carga: 3D, guía de montaje paso a paso, filtro por capas, tabla de orden de carga (permite quitar bultos), solicitudes de recogida.
- `/panel/vehiculos` — CRUD de vehículos con presets venezolanos (pickup, furgón 350/NPR, 750, gandola) y visor 3D.
- `/bolsa` — "Bolsa de viajes": bolsa pública de camiones con espacio libre (`/retornos` redirige aquí); `/bolsa/$offerId` muestra el espacio del camión en 3D con vista previa del paquete del cliente y el formulario de solicitud. Nunca mencionar "retorno/regreso" en la cara al cliente.
- `/recogidas/$token` — enlaces viejos (trip_shares): solo redirige a `/bolsa/$offerId` de la oferta del viaje.
- Área privada bajo `src/routes/_authenticated/`.

## Datos (Supabase)

- `vehicles` — tipo, nombre, placa, medidas internas (cm) y carga máx. (kg) por usuario.
- `trips` — origen/destino (slugs de ciudad), `departure_date` + `departure_time` (hora estimada, opcional), vehículo, `is_return`, y `packages` como JSON.
- `return_offers` — ofertas públicas de espacio libre (lectura pública de columnas limitadas — incluye `available_date`/`available_time`; `phone`/`trip_id`/`user_id` no son públicos). `trip_id` apunta al viaje de regreso (`is_return`), creado al publicar la oferta.
- `trip_shares` — legado: tokens de enlaces viejos; solo los lee el RPC `shared_trip` para redirigir a la oferta. Los enlaces nuevos son `/bolsa/<offer_id>` (ShareTrip crea/reusa la `return_offers` del viaje).
- `package_requests` — solicitudes de recogida; solo las lee el dueño del viaje. Llegan por la bolsa (RPC `submit_offer_request` con id de oferta). Requieren `email`. Aceptar/rechazar vía RPC `decide_package_request` (con `p_amount` en USD al aceptar). Estados: `pending → awaiting_payment → payment_review → paid` (también `rejected`/`expired`).
- El pago móvil que ve el pagador es el de la plataforma (la empresa cobra y luego liquida al conductor): env `PAGO_MOVIL_*`, adjuntado en el server fn `getPaymentSummary` — el RPC `payment_summary` lo devuelve en NULL.
- `push_subscriptions` — suscripciones Web Push ligadas a una solicitud; solo las escribe el RPC `attach_push_subscription` y las lee service_role.
- Bucket `payment-proofs` (privado) — comprobantes en `<request_id>/<uuid>`; subida anónima por signed URL de servidor, lectura solo del dueño del viaje.
- RLS habilitado en todo; los paquetes se añaden al JSON del viaje solo cuando `confirm_payment` marca `paid` (~2 s tras subir el comprobante, verificación simulada).
- `supabase/seed.sql` — datos de prueba: corre solo en `supabase db reset` o a mano con `podman exec -i supabase_db_cargaruta psql -U postgres -d postgres < supabase/seed.sql` (el seed trunca las tablas de la app al inicio; es idempotente). Cuenta demo: `chofer@cargaruta.local` / `cargaruta123` — dueña de vehículos, viajes completados y pendientes, dos ofertas en la bolsa y solicitudes en todos los estados.

## Reglas de arquitectura

- Cargo packing lives in pure TS `src/lib/packing.ts` (tested in `packing.test.ts`); the 3D viewer only draws its output — keeps the algorithm testable without WebGL.
- The 3D truck (`src/components/Truck3D.tsx`) is loaded only via `Truck3DLazy` (ClientOnly + lazy) — three.js must not run during SSR. Every 3D view follows the floating look in `specs/002-vistas-3d.md` (transparent canvas, no background/floor/frame — the truck floats on the page).
- Trip packages are stored as JSON on `trips.packages` so a trip can be duplicated/reversed in one read.
- Cargo layers and guided loading visibility live in pure TS `src/lib/loading-guide.ts`; presentation filters never modify the packing result or saved cargo.
- Shared links (trip_shares token), board offers (return_offers id) and payment pages (/pagos/<request_id>) are capabilities resolved only inside narrowly scoped database RPCs; request rows remain owner-readable only, and confirming a paid request appends its package atomically under trip/request locks to prevent duplicates.
- Payments: driver sets price in USD; the requester pays the platform's pago móvil in Bs at the BCV rate, fetched and converted only server-side (`src/lib/bcv.ts`, `payments.functions.ts`). Notifications (mail via `SMTP_URL`/Mailpit, Web Push via VAPID) fire once from the `notifyRequester` server fn guarded by `notified_at`. Service-role access lives only in server fns (`SUPABASE_SECRET_KEY`, never `VITE_`). Spec: `specs/001-pago-movil.md`.
- Maps/routing use Mapbox free tier (no spending cap): Directions API is called only server-side in `src/lib/mapbox.ts` (in-memory cache 12 h, temporary caching only per ToS — never persist results) via the `getTripRoute` server fn in `src/lib/routes.functions.ts`; it merges real km/hours/geometry/es steps with the `estimateRoute` matrix in `src/lib/venezuela.ts` (via/alcabalas/peajes stay app-specific). Always fall back to `estimateAsTripRoute` when token or network is missing. Client maps render only through `RouteMapLazy` (ClientOnly + lazy, mapbox-gl/esm + dark-v11) — never instantiate `mapboxgl.Map` during SSR and never recreate the map (each init = one billed map load). Tokens: `VITE_MAPBOX_TOKEN` (browser: tiles, Geocoding v6 autocomplete in `AddressField`/`CityField` — temporary use only, free text always allowed, nothing persisted) and `MAPBOX_TOKEN` (server). Origin/destination fields use `CityField` (local CITIES matches first, then Mapbox places snapped to the nearest hub via `nearestCity`); both it and `AddressField` expose a map-pin button opening `MapPickerDialog` (RouteMap `onPick`) to select the exact point, reverse-geocoded for display. Static Images renders the share card map in `promo-image.ts` via fetch→blob→objectURL (CORS-checked, no canvas taint). Route geometry helpers are pure TS in `src/lib/route-geometry.ts` (testable without WebGL).
- WhatsApp sharing uses `wa.me` links with prefilled text.
- PWA: `public/manifest.webmanifest` + iconos PNG en `public/icons/` (regenerar con `rsvg-convert` desde `favicon.svg` y `public/icons/icon-maskable.svg`). `public/sw.js` sirve tanto push como la instalación (listener `fetch` vacío); se registra al arrancar la app vía `registerServiceWorker()` en `src/lib/push-client.ts`. El header lleva `pt-[env(safe-area-inset-top)]` porque iOS standalone usa `black-translucent`.

## Diseño

Estilo industrial-logístico: asfalto oscuro con amarillo de señalización, tipografías Space Grotesk + IBM Plex Mono, en español. No usar estética genérica (Inter, gradientes púrpura/índigo).
