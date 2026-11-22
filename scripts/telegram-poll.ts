// Desarrollo local del bot sin túnel ni webhook: long-poll de getUpdates contra
// el mismo handleUpdate que usa /api/telegram. Corre con la misma .env
// (TELEGRAM_BOT_TOKEN + Supabase + GEMINI_API_KEY): `bun run scripts/telegram-poll.ts`.
import { deleteWebhook, getUpdates, telegramConfigured } from "../src/lib/telegram";
import { handleUpdate } from "../src/lib/telegram-bot";

if (!telegramConfigured()) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env");

// getUpdates y webhook son excluyentes: quitar el webhook para desarrollar.
await deleteWebhook();
console.log("Escuchando updates (Ctrl+C para salir)…");

let offset = 0;
for (;;) {
  try {
    const updates = await getUpdates(offset, 25);
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      try {
        await handleUpdate(update);
      } catch (e) {
        console.error(`[update ${update.update_id}]`, e);
      }
    }
  } catch (e) {
    console.error("[poll]", e instanceof Error ? e.message : e);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
