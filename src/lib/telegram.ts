// Cliente mínimo de la Telegram Bot API por fetch, solo en servidor.
// Spec: specs/003-telegram.md. El token nunca sale del servidor (TELEGRAM_BOT_TOKEN).

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};
export type TgPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};
export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_size?: number };
  location?: { longitude: number; latitude: number };
};
export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};
export type TgInlineButton = { text: string; callback_data?: string; url?: string };
export type TgMarkup = { inline_keyboard: TgInlineButton[][] } | { remove_keyboard: true };

const API = "https://api.telegram.org";

export function botToken(): string | undefined {
  return process.env["TELEGRAM_BOT_TOKEN"] || undefined;
}
export function telegramConfigured(): boolean {
  return Boolean(botToken());
}

async function api<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  extra?: { markup?: TgMarkup; parseMode?: "Markdown" | "HTML" },
): Promise<void> {
  // Telegram corta a 4096 caracteres: el asistente debe responder corto, pero
  // si se pasa, mandamos el texto en dos mensajes en vez de fallar.
  const chunks = text.length <= 4096 ? [text] : [text.slice(0, 4090) + "…", text.slice(4090)];
  for (const [i, chunk] of chunks.entries()) {
    await api("sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...(extra?.parseMode ? { parse_mode: extra.parseMode } : {}),
      ...(i === 0 && extra?.markup ? { reply_markup: extra.markup } : {}),
    });
  }
}

// Foto como bytes (QR generado en servidor, comprobantes reenviados). La Bot API
// exige multipart; el Blob lleva el tipo MIME.
export async function sendPhoto(
  chatId: number,
  photo: { data: Uint8Array; filename: string; contentType: string },
  caption?: string,
): Promise<void> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption.slice(0, 1024));
  form.set(
    "photo",
    new Blob([photo.data as unknown as BlobPart], { type: photo.contentType }),
    photo.filename,
  );
  const res = await fetch(`${API}/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`telegram sendPhoto: ${json.description ?? res.status}`);
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await api("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

// file_id → ruta temporal (válida ~1 h) → bytes. Límite Bot API: 20 MB.
export async function getFilePath(fileId: string): Promise<string> {
  const file = await api<{ file_path: string }>("getFile", { file_id: fileId });
  return file.file_path;
}
export async function downloadFile(
  filePath: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const token = botToken();
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  const res = await fetch(`${API}/file/bot${token}/${filePath}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`telegram file: ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

let meCache: { username: string; at: number } | undefined;
/** Username del bot (sin @) para armar deep-links t.me/<bot>?start=... */
export async function botUsername(): Promise<string | null> {
  const fromEnv = process.env["VITE_TELEGRAM_BOT"] || process.env["TELEGRAM_BOT_USERNAME"];
  if (fromEnv) return fromEnv.replace(/^@/, "");
  if (!botToken()) return null;
  if (meCache && Date.now() - meCache.at < 10 * 60 * 1000) return meCache.username;
  try {
    const me = await api<{ username: string }>("getMe");
    meCache = { username: me.username, at: Date.now() };
    return me.username;
  } catch {
    return null;
  }
}

export async function setWebhook(url: string, secretToken: string): Promise<boolean> {
  return api<boolean>("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    max_connections: 40,
  });
}
export async function deleteWebhook(): Promise<boolean> {
  return api<boolean>("deleteWebhook", { drop_pending_updates: false });
}
export async function getUpdates(offset: number, timeout = 25): Promise<TgUpdate[]> {
  return api<TgUpdate[]>("getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message", "callback_query"],
  });
}
export async function setMyCommands(): Promise<void> {
  await api("setMyCommands", {
    commands: [
      { command: "start", description: "Empezar o retomar una solicitud" },
      { command: "estado", description: "Ver el estado de tu solicitud" },
      { command: "cancelar", description: "Descartar el borrador actual" },
      { command: "ayuda", description: "Qué puede hacer este bot" },
    ],
    scope: { type: "all_private_chats" },
  });
}

/** Valida la forma mínima de un Update recibido por webhook/polling. */
export function parseUpdate(raw: unknown): TgUpdate | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Partial<TgUpdate>;
  if (typeof u.update_id !== "number") return null;
  return u as TgUpdate;
}
