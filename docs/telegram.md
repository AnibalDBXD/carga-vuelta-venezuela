# Bot de Telegram de CargaRuta

El bot es un **tercer canal** (la web y el correo/push siguen igual): un
asistente con Gemini que hace por chat el mismo flujo de la web — buscar
espacio, armar la solicitud, pagar por pago móvil y recibir avisos — usando
las mismas tools y RPCs. Spec técnica completa: [`specs/003-telegram.md`](../specs/003-telegram.md).

Producción: el webhook vive en `https://cargaruta.vercel.app/api/telegram`.

## Para quien envía carga

1. Desde un viaje compartido, el botón **Telegram** abre
   `t.me/<bot>?start=offer_<offerId>` — el chat arranca con el resumen de la
   oferta (ruta, fecha, espacio libre).
2. Se conversa en lenguaje natural: el asistente pide solo lo que falta
   (contacto, recogida, entrega, bultos, notas) y valida que las direcciones
   caigan sobre la ruta real del viaje.
3. Una **foto del objeto** estima medidas/peso ya embalado (Gemini visión);
   nada se agrega sin confirmar.
4. "¿Dónde embalo esto?" compartiendo ubicación o dirección → lugares para
   embalar cercanos con enlace de Google Maps.
5. Cuando el conductor acepta, escribir **"pagar"** → banco/teléfono/RIF,
   monto en USD y Bs a tasa BCV, y el QR de pago móvil como foto.
6. El comprobante se manda como foto al chat; al confirmarse el pago llega el
   aviso y la carga entra al viaje.
7. Comandos: `/estado` (estado de la solicitud), `/ayuda`, `/cancelar`.

## Para el conductor

1. En `/panel/viajes` → **Conectar Telegram**: genera un enlace de 15 min que
   vincula el chat con su cuenta.
2. Cada solicitud nueva llega por Telegram (además del correo) con botones
   **Aceptar / Rechazar**; al aceptar, el bot pide el monto en USD.
3. Cuando un pagador sube su comprobante, llega el aviso de verificación.

## Desarrollo local

```bash
bun run bot:dev     # polling getUpdates — misma lógica del webhook, sin túnel
bun run dev:all     # Supabase + web + bot juntos
```

`bot:dev` borra el webhook si había; al volver a producción corre
`bun run bot:setup` otra vez.

## Alta en producción

1. `@BotFather` → `/newbot` → `TELEGRAM_BOT_TOKEN` y username (`VITE_TELEGRAM_BOT`).
2. `TELEGRAM_WEBHOOK_SECRET` = secreto aleatorio (`crypto.randomUUID()`).
3. `GEMINI_API_KEY` de <https://aistudio.google.com/apikey> (`GEMINI_MODEL` y
   `GEMINI_VISION_MODEL` opcionales).
4. `bun run bot:setup` registra el webhook en `APP_URL/api/telegram` y publica
   los comandos.

Sin `TELEGRAM_BOT_TOKEN` los botones de Telegram no aparecen y los avisos por
Telegram se omiten sin error — la app sigue solo con correo/push. Sin
`GEMINI_API_KEY` las notificaciones siguen pero el chat conversacional no
funciona.

## Arquitectura en una vista

- `src/routes/api/telegram.ts` — webhook POST; valida el header secreto y
  responde 200 siempre.
- `src/lib/telegram-bot.ts` — dispatcher: comandos, deep-links
  (`drv_`/`req_`/`offer_`), botones del conductor, system prompt del asistente.
- `src/lib/assistant.ts` — Gemini generateContent con function calling.
- `src/lib/assistant-tools.ts` — tools compartidas con el servidor MCP
  (`docs/mcp.md`): mismo esquema de solicitud, mismos RPCs (`submit_offer_request`,
  `payment_summary`, `submit_payment_proof`, `confirm_payment`).
- `src/lib/telegram.ts` — cliente Bot API por fetch.
- Datos: `telegram_chats` (chat ↔ conductor o solicitud), `telegram_sessions`
  (estado del chat), `telegram_link_tokens` (vínculo de 15 min).
