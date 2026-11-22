// Cliente Gemini (AI Studio, free tier) para el asistente del bot: texto, visión
// y function calling vía la API generateContent. Solo corre en servidor.
// Spec: specs/003-telegram.md. GEMINI_API_KEY nunca sale del servidor.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function assistantConfigured(): boolean {
  return Boolean(process.env["GEMINI_API_KEY"]);
}
const textModel = () => process.env["GEMINI_MODEL"] || "gemini-3.1-flash-lite-preview";
const visionModel = () => process.env["GEMINI_VISION_MODEL"] || textModel();

export class RateLimitError extends Error {}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

// ---------- Wire format de Gemini ----------

type Part =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | {
      functionCall: { name: string; args?: Record<string, unknown>; id?: string };
      thoughtSignature?: string;
    }
  | { functionResponse: { name: string; response: { result: string }; id?: string } }
  | { inline_data: { mime_type: string; data: string } };
type Content = { role: "user" | "model"; parts: Part[] };

type GenerateResponse = {
  candidates?: { content?: { role?: string; parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

async function geminiGenerate(
  model: string,
  body: Record<string, unknown>,
): Promise<GenerateResponse> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 429) throw new RateLimitError("Gemini rate limit");
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as GenerateResponse;
}

// Gemini solo admite un subconjunto de JSON Schema en functionDeclarations:
// quita las claves que responde 400 (additionalProperties, $schema, …).
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const ALLOWED = new Set([
    "type",
    "format",
    "description",
    "properties",
    "required",
    "items",
    "enum",
    "default",
    "nullable",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
  ]);
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([k]) => ALLOWED.has(k))
      .map(([k, v]) =>
        // En "properties" las claves son nombres de campo, no keywords del
        // esquema: conservarlas todas y sanear solo los sub-esquemas.
        k === "properties"
          ? [
              k,
              Object.fromEntries(
                Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
                  pk,
                  sanitizeSchema(pv),
                ]),
              ),
            ]
          : [k, sanitizeSchema(v)],
      ),
  );
}

function toContents(messages: ChatMessage[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // va en system_instruction
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          { functionResponse: { name: m.name ?? "tool", response: { result: m.content ?? "" } } },
        ],
      });
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content ?? "" }],
    });
  }
  return contents;
}

const partText = (p: Part) => ("text" in p && !p.thought ? p.text : "");
const partCall = (p: Part) => ("functionCall" in p ? p.functionCall : null);

/**
 * Loop de function calling acotado: el modelo puede llamar herramientas; cada
 * resultado vuelve como functionResponse. El content del modelo se devuelve a
 * Gemini verbatim (lleva thoughtSignature, obligatorio en Gemini 3).
 */
export async function chatWithTools(opts: {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxRounds?: number;
}): Promise<string> {
  const contents = toContents(opts.messages);
  const tools = opts.tools.length
    ? [
        {
          functionDeclarations: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeSchema(t.parameters),
          })),
        },
      ]
    : undefined;
  const maxRounds = opts.maxRounds ?? 6;
  let lastText = "";
  for (let round = 0; round < maxRounds; round++) {
    const res = await geminiGenerate(textModel(), {
      system_instruction: { parts: [{ text: opts.system }] },
      contents,
      ...(tools ? { tools } : {}),
      generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
    });
    const content = res.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    if (!content || !parts.length) {
      return lastText || "No pude responder. Intenta de nuevo.";
    }
    // Verbatim: conserva thoughtSignature que el modelo exige de vuelta.
    contents.push({ role: "model", parts });
    const calls = parts.map(partCall).filter((c): c is NonNullable<typeof c> => c !== null);
    const text = parts.map(partText).join("").trim();
    if (text) lastText = text;
    if (!calls.length) return lastText;
    const responses: Part[] = [];
    for (const call of calls.slice(0, 4)) {
      let result: string;
      try {
        result = await opts.execute(call.name, call.args ?? {});
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : "no se pudo ejecutar"}`;
      }
      responses.push({
        functionResponse: {
          name: call.name,
          response: { result: result.slice(0, 6000) },
          ...(call.id ? { id: call.id } : {}),
        },
      });
    }
    contents.push({ role: "user", parts: responses });
  }
  return lastText || "Necesito que lo intentemos de otra forma. ¿Me repites qué necesitas?";
}

// El modelo a veces envuelve el JSON en prosa o fences: extraer el primer {...}.
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Visión: estima un bulto a partir de la foto. Devuelve el JSON parseado o null. */
export async function estimateFromImage(
  image: { base64: string; contentType: string },
  prompt: string,
): Promise<Record<string, unknown> | null> {
  const res = await geminiGenerate(visionModel(), {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: image.contentType, data: image.base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return extractJsonObject(parts.map(partText).join(""));
}
