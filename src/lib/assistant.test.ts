import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithTools, estimateFromImage, RateLimitError } from "./assistant";

const geminiOk = (parts: Record<string, unknown>[]) =>
  new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("chatWithTools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["GEMINI_API_KEY"];
  });

  it("devuelve el texto final cuando no hay function calls", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk([{ text: "Listo" }])));
    const reply = await chatWithTools({
      system: "s",
      messages: [{ role: "user", content: "hola" }],
      tools: [],
      execute: async () => "nunca",
    });
    expect(reply).toBe("Listo");
  });

  it("ejecuta la tool, le devuelve functionResponse al modelo y entrega el texto final", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        geminiOk([
          {
            functionCall: { name: "ver_borrador", args: {}, id: "call_1" },
            thoughtSignature: "sig",
          },
        ]),
      )
      .mockResolvedValueOnce(geminiOk([{ text: "Tu borrador tiene 1 bulto" }]));
    vi.stubGlobal("fetch", fetchMock);

    const executed: string[] = [];
    const reply = await chatWithTools({
      system: "s",
      messages: [{ role: "user", content: "qué llevo" }],
      tools: [{ name: "ver_borrador", description: "d", parameters: { type: "object" } }],
      execute: async (name) => {
        executed.push(name);
        return "Nombre: Ana · Bultos: 1) Caja 10×10×10";
      },
    });

    expect(executed).toEqual(["ver_borrador"]);
    expect(reply).toBe("Tu borrador tiene 1 bulto");
    // Segunda llamada: el content del modelo vuelve verbatim (thoughtSignature
    // incluida) y el resultado viaja como functionResponse con el mismo id.
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    const modelMsg = secondBody.contents.findLast(
      (c: { role: string; parts: { functionCall?: unknown }[] }) =>
        c.role === "model" && c.parts.some((p) => p.functionCall),
    );
    expect(modelMsg.parts[0].thoughtSignature).toBe("sig");
    const toolMsg = secondBody.contents.findLast(
      (c: { role: string; parts: { functionResponse?: unknown }[] }) =>
        c.role === "user" && c.parts.some((p) => p.functionResponse),
    );
    expect(toolMsg.parts[0].functionResponse.name).toBe("ver_borrador");
    expect(toolMsg.parts[0].functionResponse.id).toBe("call_1");
    expect(toolMsg.parts[0].functionResponse.response.result).toContain("Caja");
  });

  it("una tool que falla devuelve el error al modelo sin romper el loop", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiOk([{ functionCall: { name: "enviar_solicitud", args: {} } }]))
      .mockResolvedValueOnce(geminiOk([{ text: "Faltan datos" }]));
    vi.stubGlobal("fetch", fetchMock);
    const reply = await chatWithTools({
      system: "s",
      messages: [{ role: "user", content: "envía" }],
      tools: [{ name: "enviar_solicitud", description: "d", parameters: { type: "object" } }],
      execute: async () => {
        throw new Error("oferta cerrada");
      },
    });
    expect(reply).toBe("Faltan datos");
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    const toolMsg = secondBody.contents.findLast(
      (c: { parts: { functionResponse?: { response: { result: string } } }[] }) =>
        c.parts.some((p) => p.functionResponse),
    );
    expect(toolMsg.parts[0].functionResponse.response.result).toContain("oferta cerrada");
  });

  it("sanitiza additionalProperties de los schemas antes de declararlos", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    const fetchMock = vi.fn().mockResolvedValue(geminiOk([{ text: "ok" }]));
    vi.stubGlobal("fetch", fetchMock);
    await chatWithTools({
      system: "s",
      messages: [{ role: "user", content: "x" }],
      tools: [
        {
          name: "t",
          description: "d",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { a: { type: "string", additionalProperties: false } },
          },
        },
      ],
      execute: async () => "",
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const params = body.tools[0].functionDeclarations[0].parameters;
    expect(params.additionalProperties).toBeUndefined();
    expect(params.properties.a.additionalProperties).toBeUndefined();
    expect(params.properties.a.type).toBe("string");
  });

  it("lanza RateLimitError ante un 429 de Gemini", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(
      chatWithTools({ system: "s", messages: [], tools: [], execute: async () => "" }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("estimateFromImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["GEMINI_API_KEY"];
  });

  it("extrae el JSON aunque el modelo lo envuelva en prosa", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geminiOk([
          {
            text: 'Claro, esto es lo que veo:\n{"name":"Teclado","length":45,"width":15,"height":4,"weight":1,"fragile":true,"confidence":"alta"}',
          },
        ]),
      ),
    );
    const r = await estimateFromImage({ base64: "AA==", contentType: "image/jpeg" }, "prompt");
    expect(r?.["name"]).toBe("Teclado");
    expect(r?.["length"]).toBe(45);
  });

  it("manda la imagen como inline_data en la petición", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    const fetchMock = vi.fn().mockResolvedValue(geminiOk([{ text: "{}" }]));
    vi.stubGlobal("fetch", fetchMock);
    await estimateFromImage({ base64: "QUJD", contentType: "image/png" }, "p");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: "image/png",
      data: "QUJD",
    });
  });

  it("devuelve null si la respuesta no tiene JSON", async () => {
    process.env["GEMINI_API_KEY"] = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk([{ text: "no sé" }])));
    expect(await estimateFromImage({ base64: "AA==", contentType: "image/jpeg" }, "p")).toBeNull();
  });
});
