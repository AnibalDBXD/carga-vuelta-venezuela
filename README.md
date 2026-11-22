# CargaRuta

App de logística para camioneros en Venezuela. Planifica viajes con rutas reales, acomoda la carga
en 3D y llena el espacio libre con solicitudes de carga que se pagan por pago móvil.

> **Promesa:** _Carga más. No estés nunca vacío._

- Sistema de diseño y marca: [`design.md`](./design.md)
- Contexto de producto, decisiones y pendientes: [`contexto.md`](./contexto.md)

---

## 1. El problema

Un camionero cobra por viaje, no por kilómetro. Cada tramo que hace vacío es dinero que deja en la
carretera, y del otro lado hay comercios que necesitan mover pocas cajas justo por esa ruta y no
encuentran transporte confiable.

CargaRuta conecta las dos mitades: el conductor publica el espacio que le sobra y el embarcador
solicita ese espacio, paga en la plataforma y ve cómo su carga entra en el plan 3D del viaje.

## 2. Público objetivo

| Lado    | Quién es                                                                                                         | Qué necesita                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Oferta  | Transportistas independientes y flotas pequeñas (1–5 camiones) con pickup, furgón 350/NPR, 750/Toronto o gandola | No rodar vacío, cobrar sin perseguir clientes |
| Demanda | Bodegas, ferreterías, mercerías, distribuidores y comercios regionales con 1–10 bultos                           | Mover carga sin contratar un camión completo  |

Corredores iniciales: Valencia, Caracas, Maracay, Puerto Cabello y la red troncal (ARC, Troncal 5,
Centro Occidental). El producto está en español (es-VE) y está pensado para usarse desde el teléfono.

## 3. Producto

| Ruta                  | Qué hace                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Landing: demo 3D, cómo funciona el modelo y beneficios                                                                            |
| `/auth`               | Registro e inicio de sesión (email + Google)                                                                                      |
| `/panel`              | Redirige a `/panel/viajes`                                                                                                        |
| `/panel/viajes`       | Historial de viajes del conductor                                                                                                 |
| `/panel/viajes/nuevo` | Origen, destino, fecha y hora estimada, vehículo y paquetes                                                                       |
| `/panel/viajes/$id`   | Plan de carga: ruta en mapa, 3D, guía de montaje por capas, orden de carga y solicitudes                                          |
| `/panel/vehiculos`    | Flota: listado con miniaturas por tipo, alta y detalle de cada vehículo                                                           |
| `/bolsa`              | Bolsa de viajes pública: camiones con espacio libre                                                                               |
| `/bolsa/$offerId`     | Detalle de la oferta, vista 3D del espacio y formulario de solicitud                                                              |
| `/pagos`              | "Mis pagos" del cliente: sus solicitudes y el tracking del camión (por salir → en camino → llegó)                                 |
| `/pagos/$requestId`   | Pago móvil: monto en USD, equivalente en Bs a tasa BCV, QR y comprobante                                                          |
| `/api/telegram`       | Webhook del bot de Telegram (asistente Gemini): solicitud, pago y avisos por chat — [docs/telegram.md](./docs/telegram.md)        |
| `/api/mcp`            | Servidor MCP stateless para agentes externos: mismas tools del bot + tools del conductor con clave — [docs/mcp.md](./docs/mcp.md) |

Flujo de una solicitud: el cliente pide espacio → el conductor acepta y fija el monto en USD → el
sistema envía correo y push con el enlace de pago → el cliente paga por pago móvil y sube el
comprobante → la verificación confirma y **el paquete se añade al viaje en ese momento**.
Los mismos flujos existen por Telegram (bot conversacional) y por MCP (agentes externos).

## 4. Beneficios

- **El espacio libre se monetiza.** Se publica con m³ y kg disponibles, no con una descripción vaga.
- **Menos viajes en falso.** La bolsa filtra por origen y destino: se ve el camión que ya va hacia
  esa ciudad, no toda la flota.
- **Precio con datos.** Ruta real (Mapbox: km, horas y geometría) más peajes y alcabalas
  aproximadas de la red troncal.
- **Carga que cabe de verdad.** El acomodo 3D respeta el peso máximo, apila lo pesado abajo, no
  pone nada sobre lo frágil y avisa qué bultos no entran.
- **Se carga una sola vez.** Guía paso a paso por capas y orden de descarga; la cuadrilla no
  reacomoda a mitad de camino.
- **Cobro trazable.** Monto en USD, pago en Bs a tasa BCV, comprobante privado y confirmación antes
  de sumar la carga al viaje.
- **Difusión sin fricción.** Enlace público por viaje e imagen promocional lista para WhatsApp.

## 5. Modelo de negocio

Marketplace de dos lados con cobro centralizado:

1. El conductor publica su viaje y el espacio libre (oferta en la bolsa).
2. El embarcador solicita espacio y deja sus datos de contacto y correo.
3. El conductor acepta y fija el precio del flete **en USD**.
4. El embarcador paga el **pago móvil de la plataforma** en bolívares, a la **tasa BCV** vigente
   (consulta y conversión solo en servidor).
5. La plataforma retiene el cobro y luego **liquida al conductor**.
6. El paquete entra al viaje cuando el pago queda confirmado.

**Ingresos previstos:** comisión por flete liquidado (aún no implementada en código), suscripción
mensual para conductores con flota y destacados dentro de la bolsa.
**Costos:** infraestructura (Supabase + hosting), Mapbox (free tier sin tope de gasto), correo/push
y soporte. No hay inventario ni flota propia: el costo marginal por viaje es casi nulo.

## 6. Rentabilidad

El negocio escala con **viajes publicados**, no con camiones propios. Las palancas son tres:

| Palanca    | Cómo se mueve                                          |
| ---------- | ------------------------------------------------------ |
| Volumen    | más viajes publicados en la bolsa por corredor         |
| Conversión | % de ofertas que reciben al menos una solicitud pagada |
| Ticket     | flete promedio por tramo y comisión aplicada           |

**Ejemplo ilustrativo (no es una proyección):** 250 viajes publicados al mes, 35 % consigue carga,
flete promedio de USD 45 y comisión del 12 % → 250 × 0,35 × 45 × 0,12 ≈ **USD 470/mes** por
comisión, más 150 conductores con suscripción de USD 3 ≈ **USD 450/mes**. Con costos de
infraestructura del orden de USD 30–50/mes, el margen bruto sería superior al 90 %. Todo depende de
validar volumen y conversión reales antes de fijar la comisión.

Hoy la comisión **no está implementada**: la plataforma cobra el flete y liquida al conductor por
fuera. Definirla es el siguiente paso comercial, no técnico.

## 7. Tecnologías

| Capa              | Tecnología                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| Framework         | TanStack Start v1 (React 19, Vite, SSR) + TanStack Router/Query                   |
| Estilos           | Tailwind CSS v4 con tokens semánticos en `src/styles.css`                         |
| Backend           | Supabase local (Postgres, Auth, RLS, Storage, RPC) vía Supabase CLI               |
| Datos de servidor | `createServerFn` de TanStack Start (sin Edge Functions)                           |
| 3D                | three.js + `@react-three/fiber` + `drei` (solo cliente, GLB de vehículos)         |
| Mapas             | Mapbox GL JS + Directions/Geocoding, solo a través de `RouteMapLazy` y server fns |
| Notificaciones    | SMTP/Mailpit + Web Push (VAPID)                                                   |
| Pruebas           | Vitest + Testing Library                                                          |
| Runtime / build   | Bun, Nitro (preset Cloudflare en producción)                                      |
| PWA               | `public/manifest.webmanifest` + service worker propio (`public/sw.js`)            |

## 8. Instalación

### Requisitos

- **Bun** ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** o **Podman** para Supabase local
- **Supabase CLI** (viene como dependencia; se usa con `bunx`)
- Opcional: cuenta de **Mapbox** con token público y secreto

### Pasos

```sh
git clone <repo>
cd cargaruta
bun install

# 1. Variables de entorno
cp .env.example .env        # el .env no se versiona; completa las claves locales

# 2. Base de datos local
bun run db:start            # Supabase en :54321, Studio en :54323, Mailpit en :54324
bunx supabase status -o env # copia URL y claves a .env si hace falta

# 3. Esquema y tipos
bunx supabase db reset      # aplica supabase/migrations/*
bun run db:types            # regenera src/integrations/supabase/types.ts

# 4. App
bun run dev                 # http://localhost:5173
# si el puerto está ocupado: bun run dev -- --port 8081

# 5. Bot de Telegram (opcional; ver "Integraciones opcionales")
bun run bot:dev             # polling del bot, sin webhook ni túnel
```

**Todo de una vez:** `bun run dev:all` levanta Supabase + web + bot (Ctrl+C los apaga juntos).

Con Podman en Linux, si el CLI no encuentra el socket:

```sh
export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock
```

### Integraciones opcionales

| Variable                                      | Para qué                                       | Si falta                                                  |
| --------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| `VITE_MAPBOX_TOKEN` / `MAPBOX_TOKEN`          | mapas, autocompletado y rutas reales           | se usan rutas estimadas y el mapa muestra “no disponible” |
| `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | avisos push al aceptar una solicitud           | llega solo el correo                                      |
| `SMTP_URL` o `MAILPIT_URL`                    | correos de aceptación y pago                   | en dev se leen en Mailpit                                 |
| `PAGO_MOVIL_*`                                | datos de cobro que ve el pagador               | la página de pago avisa que no están configurados         |
| `BCV_FALLBACK_RATE`                           | tasa USD/VES si `bcv.org.ve` no responde       | se usa la última tasa en caché                            |
| `TELEGRAM_BOT_TOKEN` / `VITE_TELEGRAM_BOT`    | bot de Telegram (spec `specs/003-telegram.md`) | sin bot; el resto de la app funciona igual                |
| `GEMINI_API_KEY`                              | asistente IA del bot (AI Studio free tier)     | el chat responde "asistente no configurado"               |

Generar llaves VAPID: `bunx web-push generate-vapid-keys`.

### Verificar la instalación

```sh
bun run typecheck   # tsc --noEmit
bun run test        # vitest
bun run lint
```

Abre `http://localhost:5173`, entra a `/bolsa` y crea una cuenta desde `/auth` para ver el panel.

## 9. Comandos

| Comando                        | Qué hace                                                 |
| ------------------------------ | -------------------------------------------------------- |
| `bun run dev:all`              | **Stack completo**: Supabase + web + bot en una terminal |
| `bun run dev`                  | Dev server con SSR en `:5173`                            |
| `bun run bot:dev`              | Bot de Telegram por polling (desarrollo, sin webhook)    |
| `bun run bot:setup`            | Registra el webhook y comandos del bot (producción)      |
| `bun run build`                | Build de producción (Nitro, preset Vercel)               |
| `bun run test`                 | Vitest                                                   |
| `bun run typecheck`            | `tsc --noEmit`                                           |
| `bun run lint`                 | ESLint                                                   |
| `bun run db:start` / `db:stop` | Levanta / apaga Supabase local                           |
| `bun run db:types`             | Regenera los tipos desde la base local                   |

## 10. Migraciones y datos

Las migraciones viven en `supabase/migrations/` y se aplican al arrancar `db:start` o con
`bunx supabase db reset`. Después de cambiar el esquema corre `bun run db:types`; no se editan a
mano los tipos generados.

Tablas principales: `vehicles`, `trips` (paquetes como JSON), `return_offers` (bolsa),
`package_requests` (solicitudes y estados de pago) y `push_subscriptions`. RLS activo en todo;
los comprobantes van a un bucket privado `payment-proofs`.

## 11. Problemas conocidos

- Los modelos GLB piden `/models/Textures/colormap.png`, que hoy no está en `public/models`: el
  camión carga sin textura. Copiar esa carpeta o reempaquetar los `.glb` con la textura embebida.
- En dev aparece una vez el aviso de React sobre desmontar un root durante el render; es HMR del
  canvas 3D y no afecta la build.
- Sin tokens de Mapbox la app funciona, pero con rutas estimadas y sin autocompletado.

## 12. Despliegue

Guía completa para Supabase hosted + Vercel, incluyendo cómo trabajar como colaborador del repo:
[`docs/despliegue.md`](./docs/despliegue.md).
