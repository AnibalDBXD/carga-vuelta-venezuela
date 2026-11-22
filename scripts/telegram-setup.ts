// Registra el webhook del bot en producción: `bun run scripts/telegram-setup.ts`.
// Requiere TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET y APP_URL en .env.
import { botUsername, setMyCommands, setWebhook, telegramConfigured } from "../src/lib/telegram";

if (!telegramConfigured()) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env");
const appUrl = process.env["APP_URL"];
const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];
if (!appUrl) throw new Error("Falta APP_URL en .env (dominio público de la app)");
if (!secret) throw new Error("Falta TELEGRAM_WEBHOOK_SECRET en .env");

const username = await botUsername();
const url = `${appUrl.replace(/\/+$/, "")}/api/telegram`;
await setWebhook(url, secret);
await setMyCommands();
console.log(`Webhook registrado: ${url} (bot @${username ?? "?"})`);
