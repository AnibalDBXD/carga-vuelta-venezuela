# Spec: Cobro por pago móvil tras aceptar solicitud

## Flujo

1. Solicitante pide espacio (bolsa o enlace directo) y deja nombre, teléfono y **correo**.
2. Conductor acepta escribiendo el **monto en USD** → la solicitud pasa a `awaiting_payment` (el paquete aún NO entra a la carga).
3. Al aceptar, el servidor envía al solicitante: **correo** + **push** (si aceptó permisos) con el enlace `/pagos/<request_id>`.
4. `/pagos/<request_id>` muestra resumen del viaje y la carga, el monto en USD y su equivalente en **Bs a tasa BCV** (calculado en servidor), con los datos del **pago móvil de la plataforma** y **QR**.
5. El solicitante paga por pago móvil y **sube una captura** del comprobante → estado `payment_review`.
6. `confirm_payment` (llamado por polling de la página) simula la verificación: tras ~2 s marca `paid` y **añade el paquete al viaje atómicamente**. La página muestra "Pago confirmado, tu carga va en el viaje".

## Modelo de datos (nueva migración `2026XXXXXXXXXX_payments.sql`)

### `package_requests` (ALTER)

- `email text NOT NULL` (nuevo, validado en RPC)
- `amount_usd numeric` (lo fija el conductor al aceptar, en dólares)
- `status`: CHECK ampliado a `'pending','awaiting_payment','payment_review','paid','rejected','expired'`
- `proof_path text` (ruta en el bucket), `proof_submitted_at timestamptz`, `paid_at timestamptz`
- `payment_expires_at timestamptz` (= `decided_at + interval '24 hours'`)

### Pago móvil de la plataforma (config, no tabla)

El modelo es marketplace: **la empresa cobra al solicitante y luego liquida al conductor** (liquidación fuera de la app por ahora). La cuenta receptora se configura por env (`PAGO_MOVIL_BANK`, `PAGO_MOVIL_PHONE`, `PAGO_MOVIL_DOCUMENT`, `PAGO_MOVIL_HOLDER`) y la adjunta el server fn `getPaymentSummary` — no es un dato del conductor ni vive en la base de datos.

### `push_subscriptions` (nueva tabla)

`id uuid pk, request_id uuid REFERENCES package_requests(id) ON DELETE CASCADE, endpoint text UNIQUE NOT NULL, p256dh text NOT NULL, auth text NOT NULL, created_at`. Sin SELECT público; se escribe solo vía RPC `attach_push_subscription`.

### Storage

Bucket privado `payment-proofs`. Objetos en `<request_id>/<uuid>.<ext>`. Política en `storage.objects`: el dueño del viaje de la solicitud puede leer sus comprobantes. La subida anónima usa URL firmada generada en servidor (service role), nunca write público al bucket.

## RPCs (plpgsql, SECURITY DEFINER, mismas convenciones que hoy)

- `insert_package_request(..., p_email text)` — valida email (`^[^@\s]+@[^@\s]+\.[^@\s]+$`, ≤254); todas las RPCs de envío lo propagan.
- `decide_package_request(p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL)` — mismo patrón de locks; al aceptar exige `p_amount > 0` (USD), pone `status='awaiting_payment'`, `amount_usd`, `decided_at`, `payment_expires_at`. **Ya no añade el paquete.** Rechazar sigue igual.
- `payment_summary(p_request uuid) RETURNS jsonb` — capability read para anon/authenticated: `origin, destination, departure_date, vehicle_kind, package, sender_name, amount_usd, status, proof_path IS NOT NULL`. `payment_method` sale en NULL del RPC; el server fn `getPaymentSummary` lo rellena con la cuenta de la plataforma **solo** si `status IN ('awaiting_payment','payment_review','paid')`. El monto en Bs tampoco va en el RPC: lo calcula el server fn (ver Tasa BCV).
- `attach_push_subscription(p_request uuid, p_endpoint text, p_p256dh text, p_auth text)` — upsert por endpoint; ejecutable por anon.
- `submit_payment_proof(p_request uuid, p_path text)` — exige `status='awaiting_payment'`, `payment_expires_at > now()`, y que `p_path` empiece por `<p_request>/`; pasa a `payment_review` + `proof_submitted_at`.
- `confirm_payment(p_request uuid) RETURNS text` — idempotente, ejecutable por anon:
  - `paid` → devuelve `'paid'`.
  - `payment_review` y `now() - proof_submitted_at >= 2s` → lock de la solicitud y del viaje, `status='paid'`, `paid_at`, append del `package` a `trips.packages` (anti-duplicado igual que hoy) → `'paid'`.
  - `awaiting_payment` y `payment_expires_at < now()` → `status='expired'` → `'expired'`.
  - resto → devuelve el estado actual (la página hace polling cada ~1 s).

## Server functions (`createServerFn`, `src/lib/`)

- `decideRequest({ requestId, accept, amountUsd })` — reemplaza la llamada directa a `rpc` desde `TripRequests`. Cliente con JWT del usuario → `decide_package_request`. Si aceptó: con cliente service-role lee `email` de la solicitud + `push_subscriptions` y dispara `notifyRequesterAccepted` (correo + push) sin bloquear el resultado (errores de notificación → log, no fallan la aceptación).
- `getProofUploadUrl({ requestId })` — verifica vía `payment_summary` que está `awaiting_payment`, genera signed upload URL en `payment-proofs/<requestId>/<uuid>` con service role.
- `sendMail` helper — SMTP por `SMTP_URL` (dev: Inbucket de `supabase status`; prod: provider). Sin SMTP configurado → log y continuar.
- `sendPush` helper — `web-push` con `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; elimina suscripciones 404/410.

## Tasa BCV (server-side)

- Server fn `getBcvRate()` → `{ rate, fetchedAt }`: hace `fetch('https://www.bcv.org.ve/')`, extrae el USD del bloque `id="dolar"` (decimales con coma, ej. `36,500000`) y lo normaliza a número. Se ejecuta solo en servidor — nunca se expone el HTML ni se parsea en el cliente.
- Caché en memoria del proceso (módulo) con TTL ~1 h; si el fetch falla devuelve la última tasa conocida; si nunca hubo una, `BCV_FALLBACK_RATE` de env o error controlado ("No se pudo obtener la tasa BCV").
- El equivalente en Bs se calcula en el server fn que sirve la página de pago (`amount_bs = total_usd * rate`), así el solicitante siempre ve la tasa del día y el QR/datos de pago móvil llevan Bs. En el correo/push se menciona el monto en USD (el total que paga el solicitante).

## Comisión de la plataforma (25%)

- El conductor fija `amount_usd` al aceptar: es **lo que recibe** (neto). `PLATFORM_FEE = 0.25` en `src/lib/package-request.ts`.
- `total_usd = amount_usd × 1.25` se **congela en la fila** `package_requests` al aceptar y es lo que paga el solicitante (en Bs a tasa BCV). La empresa cobra el total y liquida al conductor por fuera de la app.
- Filas viejas sin `total_usd` usan el mismo ×1.25 como fallback vía `clientTotalUsd(amount_usd, total_usd)`, así lo mostrado/cobrado al solicitante es siempre el total.
- En la vista del conductor el monto se etiqueta "para ti" (neto); al solicitante se le muestra solo el total en `/pagos/<id>`, correo y push.

## Notificaciones

- **Correo**: plantilla HTML/texto simple, tono del app, con ruta, fecha, monto en USD y botón al enlace `/pagos/<id>`. Dev se lee en Inbucket.
- **Push**: `public/sw.js` (evento `push` → muestra notificación con la URL del pago; `notificationclick` → `clients.openWindow`). En la pantalla de "Solicitud enviada" aparece "Avisar cuando me acepten" → `Notification.requestPermission` + `pushManager.subscribe` → `attach_push_subscription` con el `request_id` devuelto por el submit.

## Frontend

- `PackageRequestForm`: campo **Correo** (obligatorio, `type="email"`); pantalla de éxito muestra además el opt-in de push y un enlace directo a `/pagos/<id>` ("aquí pagarás cuando te acepten").
- `TripRequests`: al Aceptar abre diálogo pidiendo **Monto (USD)** obligatorio, mostrando debajo el equivalente en Bs a la tasa BCV del momento (vía `getBcvRate`). Estados nuevos: `awaiting_payment` → "Esperando pago", `payment_review` → "Comprobante recibido", `paid` → "Pagada", `expired` → "Pago vencido". En `paid`/`payment_review`, enlace "Ver comprobante" (signed URL).
- `src/routes/pagos/$requestId.tsx` (pública): carga `payment_summary` por server fn; estados: datos + QR si `awaiting_payment`; "verificando pago…" si `payment_review` (polling a `confirm_payment`); confirmado si `paid`; vencido/rechazada con mensajes acordes. Muestra el monto en **USD** y su equivalente en **Bs** (calculado en servidor a tasa BCV) — el pago móvil se hace en Bs. Datos pago móvil con botón "Copiar" por campo y **QR** (`react-qr-code`) que codifica `banco|telefono|cedula|monto_bs` (formato EMV real de pago móvil interbancario queda como mejora futura). Upload: jpg/png/webp ≤ 5 MB, `getProofUploadUrl` → PUT a storage → `submit_payment_proof`.

## Env / dependencias

- `.env`/`.env.example`: `SUPABASE_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SMTP_URL` (opcional en dev), `BCV_FALLBACK_RATE` (opcional), `PAGO_MOVIL_BANK/PHONE/DOCUMENT/HOLDER` (cuenta receptora de la plataforma).
- Nuevas deps: `web-push` (+ `@types/web-push`), `react-qr-code`, `nodemailer` (+ tipos) o equivalente SMTP ligero.
- Regenerar `types.ts` con `bun run db:types`.

## Seguridad

- `request_id` uuid actúa como capability (ya se entrega al solicitante); `payment_summary` expone columnas mínimas y el pago móvil solo tras aceptar.
- Comprobantes en bucket privado; escritura solo por signed URL servidor; lectura solo del dueño del viaje.
- Service role key solo en server fns (nunca `VITE_`).

## Fuera de alcance

- Verificación bancaria real del pago (hoy se simula con el retardo de `confirm_payment`); confirmación manual del conductor; reembolsos; liquidación automática al conductor; formato QR EMV interbancario.

## Verificación

- `bun run db:start` + migración aplicada; `bunx vitest run` (routing test + nuevos tests del zod schema de email/QR payload); `bun run typecheck`.
- Manual E2E: solicitud con correo → aceptar con monto → correo en Inbucket + push → `/pagos/...` → subir captura → ~2 s → `paid` y paquete visible en la guía 3D.
