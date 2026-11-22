import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUpdate, sendMessage } from "./telegram";

const okResponse = () =>
  new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("parseUpdate", () => {
  it("acepta un update con update_id numérico", () => {
    const raw = { update_id: 42, message: { chat: { id: 1 } } };
    expect(parseUpdate(raw)?.update_id).toBe(42);
  });
  it("rechaza cuerpos sin update_id o no objetos", () => {
    expect(parseUpdate(null)).toBeNull();
    expect(parseUpdate("texto")).toBeNull();
    expect(parseUpdate({})).toBeNull();
    expect(parseUpdate({ update_id: "42" })).toBeNull();
  });
});

describe("sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["TELEGRAM_BOT_TOKEN"];
  });

  it("envía un mensaje con teclado inline en el body correcto", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await sendMessage(123, "Hola", {
      markup: { inline_keyboard: [[{ text: "Aceptar", callback_data: "a:1" }]] },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottok/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe(123);
    expect(body.text).toBe("Hola");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("a:1");
  });

  it("corta mensajes largos en dos y solo el primero lleva el teclado", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const markup = { inline_keyboard: [[{ text: "x", url: "https://x" }]] };
    await sendMessage(1, "a".repeat(5000), { markup });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(first.reply_markup).toEqual(markup);
    expect(second.reply_markup).toBeUndefined();
    expect(first.text.length + second.text.length).toBeGreaterThanOrEqual(5000);
  });

  it("propaga el error cuando la Bot API responde ok:false", async () => {
    process.env["TELEGRAM_BOT_TOKEN"] = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(sendMessage(1, "x")).rejects.toThrow("chat not found");
  });
});
