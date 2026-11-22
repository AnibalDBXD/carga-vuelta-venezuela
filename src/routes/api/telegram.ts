// Webhook del bot de Telegram (spec: specs/003-telegram.md). Solo POST; el
// header secreto que Telegram manda con cada update evita que cualquiera
// dispare el flujo. Responde 200 siempre para que Telegram no reintente.
import { createFileRoute } from "@tanstack/react-router";
import { handleUpdate } from "@/lib/telegram-bot";
import { parseUpdate } from "@/lib/telegram";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("[tg-webhook] falta TELEGRAM_WEBHOOK_SECRET");
          return Response.json({ ok: false }, { status: 503 });
        }
        if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
          return Response.json({ ok: false }, { status: 403 });
        }
        let update;
        try {
          update = parseUpdate(await request.json());
        } catch {
          update = null;
        }
        if (!update) return Response.json({ ok: true });
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error("[tg-webhook]", e);
        }
        return Response.json({ ok: true });
      },
      GET: () => Response.json({ ok: true, service: "cargaruta-telegram" }),
    },
  },
});
