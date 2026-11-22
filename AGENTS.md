

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

# CargaRuta — contexto para agentes

## Qué es

App de logística para camioneros en Venezuela (base Valencia). El objetivo clave es evitar viajes de regreso vacíos: el conductor planifica un viaje, optimiza la carga en 3D y comparte su espacio libre para el retorno. Toda la interfaz y los mensajes están en español (es-VE).

## Stack

- TanStack Start v1 (React 19, Vite 7, SSR en workerd). Rutas en `src/routes`; nunca usar react-router-dom ni App.tsx.
- Tailwind CSS v4 vía `src/styles.css` (tokens semánticos; no hardcodear colores en componentes).
- Backend: Lovable Cloud (Supabase). Cliente navegador: `@/integrations/supabase/client`. Lógica de servidor con `createServerFn`; nada de Supabase Edge Functions.
- 3D: three.js + @react-three/fiber/drei, solo en cliente.
- Tests: vitest (`bunx vitest run`). Typecheck: `oj typecheck -b --noEmit`.

## Mapa de la app

- `/` — landing con demo 3D (`src/routes/index.tsx`).
- `/auth` — login/registro (email + Google).
- `/viajes` — historial de viajes; `/viajes/nuevo` — formulario de viaje (origen/destino, fecha, vehículo, paquetes); `/viajes/$id` — plan de carga: 3D, guía de montaje paso a paso, filtro por capas, tabla de orden de carga, solicitudes de recogida.
- `/vehiculos` — CRUD de vehículos con presets venezolanos (pickup, furgón 350/NPR, 750, gandola) y visor 3D.
- `/retornos` — bolsa pública de cargas de retorno.
- `/recogidas/$token` — formulario público (sin cuenta) para solicitar recogida en un viaje de regreso compartido.
- Área privada bajo `src/routes/_authenticated/`.

## Datos (Lovable Cloud)

- `vehicles` — tipo, nombre, placa, medidas internas (cm) y carga máx. (kg) por usuario.
- `trips` — origen/destino (slugs de ciudad), fecha, vehículo, `is_return`, y `packages` como JSON.
- `return_offers` — ofertas públicas de espacio de retorno (lectura pública).
- `trip_shares` — enlace compartible por viaje de regreso (token = id aleatorio, flag `active`).
- `package_requests` — solicitudes de recogida; solo las lee el dueño del viaje. Aceptar/rechazar vía RPC `decide_package_request`.
- RLS habilitado en todo; paquetes aceptados se añaden al JSON del viaje.

## Reglas de arquitectura

- Cargo packing lives in pure TS `src/lib/packing.ts` (tested in `packing.test.ts`); the 3D viewer only draws its output — keeps the algorithm testable without WebGL.
- The 3D truck (`src/components/Truck3D.tsx`) is loaded only via `Truck3DLazy` (ClientOnly + lazy) — three.js must not run during SSR.
- Trip packages are stored as JSON on `trips.packages` so a trip can be duplicated/reversed in one read.
- Cargo layers and guided loading visibility live in pure TS `src/lib/loading-guide.ts`; presentation filters never modify the packing result or saved cargo.
- Shared return-trip links use random capability tokens and narrowly scoped database RPCs; request rows remain owner-readable only, and accepting a pending request appends its package atomically under trip/request locks to prevent duplicates.
- Route estimates (km, hours, tolls, checkpoints) are a preloaded matrix in `src/lib/venezuela.ts` — approximations, not official data; no external maps API.
- WhatsApp sharing uses `wa.me` links with prefilled text; they are blocked inside the editor preview iframe but work on the published site — do not "fix" them.

## Diseño

Estilo industrial-logístico: asfalto oscuro con amarillo de señalización, tipografías Space Grotesk + IBM Plex Mono, en español. No usar estética genérica (Inter, gradientes púrpura/índigo).
