# Spec: Bot de Telegram con asistente IA (Gemini)

Telegram como tercer canal (correo y Web Push siguen igual): notificaciones y
el flujo completo de solicitud+pago por chat, guiado por un asistente que usa
las mismas herramientas/RPCs de la web. Todo free tier: Bot API (gratis),
Gemini API (AI Studio), Supabase, Mapbox, Vercel.

## Flujo del solicitante

1. `Compartir espacio` (ShareTrip) muestra **Telegram** como primer botón:
   abre el chat del bot con `https://t.me/<bot>?start=offer_<offerId>`
   (deep-link; Telegram manda `/start offer_<id>` al pulsar Start).
2. Quien abre el enlace cae en el chat del bot: `/start offer_<id>` guarda la
   oferta en la sesión y saluda con el resumen (ruta, fecha, espacio libre).
3. El asistente (Gemini + function calling) pide por lenguaje natural solo lo que
   falta del mismo esquema `offerRequestSchema`: contacto (nombre, teléfono,
   correo), recogida, entrega, bultos (descripción, cm, kg, cantidad, frágil) y
   notas. `ver_borrador` resume; `enviar_solicitud` exige confirmación
   explícita y llama al RPC `submit_offer_request` — mismo punto de entrada
   que la web.
   - `guardar_direcciones` valida cada dirección: el geocodificador debe
     encontrarla y debe caer sobre el corredor del viaje (≤30 km de la
     geometría real de Directions, o del eje origen→destino sin token); si no,
     se rechaza explicando por qué ciudades pasa la ruta.
   - `agregar_bulto` reemplaza un bulto con el mismo nombre (corrección, no
     duplicado); el borrador actual se inyecta en el system prompt para que el
     modelo solo pida lo que falta.
4. Al enviarse: el chat queda vinculado a la solicitud (`telegram_chats`) y el
   conductor recibe su aviso (correo + Telegram con botones).
5. Foto del objeto → Gemini visión estima medidas/peso YA EMBALADO con nivel de
   confianza; el usuario confirma con botón antes de agregar el bulto (nunca
   se agrega solo).
6. "¿Dónde embalo esto?" → `lugares_para_embalar`: usa la ubicación que el
   usuario comparte, o geocodifica su dirección (Mapbox Geocoding v6, solo
   consulta, sin persistir), y devuelve hasta 3 lugares con enlace de Google
   Maps. Sin punto conocido devuelve un enlace de búsqueda genérico.
7. Aceptada la solicitud, el aviso dice que escriba **"pagar"** →
   `datos_de_pago` muestra banco/teléfono/cédula/titular de la plataforma,
   monto en USD y Bs a tasa BCV, y manda el QR como foto.
8. El comprobante se envía como foto al chat → se sube al bucket privado
   `payment-proofs/<request>/…` vía service role y `submit_payment_proof`
   pone `payment_review`. Luego se sondea `confirm_payment` y al llegar
   `paid` dispara `notifyRequesterPaid` (correo + Telegram, guard
   `paid_notified_at`) — idéntica confirmación atómica que la web.
9. `/estado` consulta `payment_summary` (mismo capability RPC público).

## Flujo del conductor

1. `/panel/viajes` muestra **Conectar Telegram**: inserta un
   `telegram_link_tokens` (15 min, un solo uso) y abre
   `t.me/<bot>?start=drv_<token>`; `/start drv_…` vincula `chat_id ↔ user_id`
   y consume el token. El botón pasa a "Telegram conectado" (lee su fila por
   RLS).
2. Cada solicitud nueva (web o bot) dispara `notifyDriverOfRequest`: correo +
   Telegram con inline keyboard `Aceptar` (`a:<req>`) / `Rechazar` (`r:<req>`)
   / `Ver solicitud`.
3. **Aceptar** → el bot pide el monto en USD por mensaje →
   `decide_package_request_bot` (autoriza por chat vinculado = dueño del viaje)
   → `awaiting_payment` y aviso al solicitante. **Rechazar** → `rejected`.
4. Cuando el solicitante sube comprobante (web o bot), `notifyDriverOfProof`
   avisa por correo + Telegram que el pago está en verificación.

## Arquitectura

- `src/lib/telegram.ts` — cliente Bot API por fetch (sendMessage con split a
  4096, sendPhoto multipart, getFile/downloadFile, setWebhook, getUpdates,
  answerCallbackQuery, botUsername con caché). Token solo `TELEGRAM_BOT_TOKEN`.
- `src/lib/assistant.ts` — Gemini generateContent: `chatWithTools` (loop ≤6
  rondas, ≤4 calls por ronda, errores de tool vuelven como `functionResponse`),
  `estimateFromImage` (visión `inline_data`, extrae el primer `{…}`),
  `RateLimitError` en 429. Los parts del modelo se reenvían verbatim para
  conservar `thoughtSignature` (exigida por Gemini 3 en function calling) y el
  `id` de cada call en su `functionResponse`. Los JSON Schema se sanezan al
  subconjunto que admite `functionDeclarations` (sin `additionalProperties`).
  Modelos por env: `GEMINI_MODEL` (texto, default `gemini-3.1-flash-lite-preview`),
  `GEMINI_VISION_MODEL` (default = `GEMINI_MODEL`).
- `src/lib/assistant-tools.ts` — **capa compartida** (la fase 2 MCP la reusa
  tal cual): sesión (`loadSession`/`saveSession`, TTL 24 h, historial ≤12),
  vínculos, `fetchOffer`/`fetchPaymentSummary` (cliente anon, mismas columnas
  públicas y capability RPC), 12 tools declaradas en `TOOL_DEFS` y ejecutadas
  en `runTool(ctx, name, args)`; estimación por foto y comprobante.
- `src/lib/telegram-bot.ts` — dispatcher: `handleUpdate` (callback vs
  mensaje, solo chats privados, catch global que avisa al chat), `/start` con
  deep-links `drv_/req_/offer_`, comandos `/estado` `/cancelar` `/ayuda`,
  ubicación → embalaje, foto → comprobante si `awaiting_payment` si no
  estimación, modo "esperando monto del conductor" (`driver_amount_for`),
  system prompt con oferta activa/vínculo de conductor y reglas (respuestas
  cortas, no inventar datos, nunca decir "regreso").
- `src/routes/api/telegram.ts` — webhook POST: valida header
  `x-telegram-bot-api-secret-token` == `TELEGRAM_WEBHOOK_SECRET`, `parseUpdate`
  mínimo, responde 200 siempre (Telegram no reintenta).
- `scripts/telegram-poll.ts` (`bun run bot:dev`) — getUpdates en loop contra
  el mismo `handleUpdate` para desarrollo sin túnel.
- `scripts/telegram-setup.ts` (`bun run bot:setup`) — `setWebhook(APP_URL/api/telegram, secret)` + `setMyCommands`.

## Datos (migración `20261122000005_telegram.sql`)

- `telegram_chats` — `chat_id bigint`, `user_id` XOR `request_id` (CHECK
  `num_nonnulls=1`), índices únicos `(chat_id,user_id)` y `(chat_id,request_id)`
  (UNIQUE simple: NULL distinto entre sí, así ON CONFLICT los infiere; un
  índice parcial no lo inferiría PostgREST). RLS: solo service_role; el
  conductor hace SELECT de su fila (`user_id = auth.uid()`).
- `telegram_sessions` — `chat_id` PK, `flow`/`history` jsonb. Solo service_role.
- `telegram_link_tokens` — id uuid PK, `user_id = auth.uid()` default,
  `expires_at` +15 min, `used_at`. INSERT/SELECT authenticated propio.
- `package_requests.paid_notified_at` — guard del aviso "pagado".
- `apply_request_decision(owner, id, accept, amount)` — núcleo compartido
  (lock del viaje, `pending` solamente, `trip_window_closed`, monto>0,
  `total_usd = amount*1.25`, `payment_expires_at = +24 h`). Sin GRANT público.
- `decide_package_request` — wrapper con `auth.uid()` (web, authenticated).
- `decide_package_request_bot(chat_id, request, accept, amount)` — solo
  service_role: autoriza si el chat está vinculado al dueño del viaje de esa
  solicitud, luego delega en `apply_request_decision`.

## Notificaciones añadidas (complemento, no reemplazo)

| Evento             | Solicitante                                      | Conductor                             |
| ------------------ | ------------------------------------------------ | ------------------------------------- |
| Solicitud nueva    | —                                                | correo + Telegram (botones ✅/❌/ver) |
| Aceptada           | correo + push + Telegram (instrucciones de pago) | —                                     |
| Comprobante subido | —                                                | correo + Telegram (verificación)      |
| Pagada             | correo + Telegram (`paid_notified_at`)           | —                                     |

Todo `Promise.allSettled` + logs: un fallo de Telegram/correo nunca invalida
la mutación. Guards `notified_at`/`paid_notified_at` evitan duplicados.

## Seguridad

- Secretos solo en servidor: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
  `GEMINI_API_KEY`. `VITE_TELEGRAM_BOT` (username público) es el único VITE_.
- Webhook rechaza updates sin el header secreto; solo `message` y
  `callback_query`.
- El comprobante/fotos se descargan de `api.telegram.org` con límite 5 MB y
  whitelist jpeg/png/webp; el token nunca va a terceros ni al cliente.
- Decisión del conductor doble-verificada: `driverLinked(chatId)` en TS y el
  RPC exige `chat_id ↔ trips.user_id`.
- Deep-link `req_<uuid>`/`offer_<uuid>` expone solo capability pública (igual
  que `/pagos/<id>`); no filtra datos privados.
- La estimación por foto es eso: estimación con confianza; requiere botón de
  confirmación del usuario.

## Free tier / límites operativos

- Gemini: timeouts 45 s, `maxOutputTokens` 1200, ≤6 rondas de tools, historial
  ≤12 mensajes; 429 → "ocupado, reintenta en un minuto". Modelo default lite
  (mayor cuota gratis); si una key nueva no tiene `gemini-2.5-*`, basta cambiar
  `GEMINI_MODEL` por uno disponible en esa cuenta (`GET /v1beta/models`).
- Telegram: textos ≤4096 (split), fotos ≤20 MB de bajada / 5 MB de procesada,
  respuestas cortas por prompt.
- Supabase: sesiones en 1 tabla, TTL 24 h aplicado al leer; vínculos en 1 tabla.
- Mapbox: geocoding bajo demanda sin persistencia (ToS), fallback a enlace de
  Google Maps si no hay token o resultados.
- Vercel: el webhook procesa en-linea (workload <30 s típico); para alto
  volumen convendría cola externa — fuera de free tier, no se implementa.

## Fase 2 (MCP, implementada)

`src/routes/api/mcp.ts` con `@modelcontextprotocol/sdk`
(`WebStandardStreamableHTTPServerTransport`, stateless: servidor y transporte
nuevos por request). Las tools de `assistant-tools.ts` se exponen igual pero
**sin sesión**: el borrador viaja con el cliente como argumento `draft` y
cada tool mutadora lo devuelve en `structuredContent.draft`.

- `src/lib/mcp-tools.ts` — resolveMcpUser (Bearer → mcp_tokens → user_id),
  TOOLS con esquemas zod, `createMcpServer(userId)`.
- Sin token: solo tools del solicitante (buscar_ofertas — filtra por
  origen/destino —, ver_oferta, guardar_*, agregar/
  quitar_bulto, agregar_nota, ver_borrador, enviar_solicitud,
  estado_solicitud, datos_de_pago — devuelve el payload del QR en texto —,
  lugares_para_embalar, estimar_bulto y subir_comprobante; ambas con imagen
  por `imagen_url` pública (guard SSRF: no hosts privados) o
  `imagen_base64` → mismo núcleo `submitProofBytes` que el bot).
- Con token de conductor (`Authorization: Bearer <id>`):
  `solicitudes_pendientes` y `decidir_solicitud` →
  `decide_package_request_mcp(user, request, accept, amount)` que autoriza
  por dueño del viaje y delega en `apply_request_decision`.
- `mcp_tokens` — el id ES el bearer; el conductor genera/revoca claves desde
  «API» en `/panel/viajes` (RLS propia, `revoked_at`, nunca `user_metadata`).
