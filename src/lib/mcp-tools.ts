// Servidor MCP (spec specs/003-telegram.md, fase 2): expone las mismas
// herramientas del asistente a agentes externos por Streamable HTTP stateless.
// A diferencia del bot no hay chat ni sesión: el borrador de la solicitud
// viaja con el cliente y se pasa como argumento `draft` en cada llamada.
// La autorización es capability (offer_id / request_id, igual que la web y
// /pagos/<id>) salvo las herramientas del conductor, que piden
// `Authorization: Bearer <id de mcp_tokens>` — el servidor lo resuelve a
// user_id con service_role y decide_package_request_mcp verifica que ese
// usuario sea dueño del viaje (mismo núcleo apply_request_decision).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { estimateFromImage, extractJsonObject } from "./assistant";
import {
  describeOffer,
  draftSummary,
  ESTIMATE_PROMPT,
  IMAGE_TYPES,
  MAX_IMAGE,
  runTool,
  submitProofBytes,
  type BotContext,
  type Draft,
} from "./assistant-tools";
import { offerDeparted } from "./offer-time";
import { publicClient, serviceClient } from "./package-requests.functions";
import { PUBLIC_OFFER_COLUMNS, type PublicOffer } from "./package-request";
import { CITIES } from "./venezuela";
import { formatUsd } from "./pago-movil";

// ---------- Autenticación del conductor ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resuelve `Authorization: Bearer <token>` contra mcp_tokens (id = token). */
export async function resolveMcpUser(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!UUID_RE.test(token)) return null;
  const { data } = await serviceClient()
    .from("mcp_tokens")
    .select("user_id")
    .eq("id", token)
    .is("revoked_at", null)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

// ---------- Esquemas compartidos ----------

const draftPkgInput = z.object({
  name: z.string().describe("Descripción corta, ej. 'Caja con libros'"),
  length: z.number().describe("Largo en cm"),
  width: z.number().describe("Ancho en cm"),
  height: z.number().describe("Alto en cm"),
  weight: z.number().describe("Peso por bulto en kg"),
  qty: z.number().int().describe("Cantidad de bultos iguales").default(1),
  fragile: z.boolean().describe("Si es frágil").default(false),
  deadline: z.string().optional(),
});

const draftInput = z
  .object({
    sender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    pickup: z.string().optional(),
    delivery: z.string().optional(),
    notes: z.string().optional(),
    packages: z.array(draftPkgInput).default([]),
  })
  .describe(
    "Borrador de la solicitud tal como lo devolvió la última llamada (cada tool mutadora lo devuelve actualizado en structuredContent.draft)",
  );

/** Convierte el argumento `draft` del cliente en el Draft interno. */
export function toDraft(value: unknown): Draft {
  const parsed = draftInput.safeParse(value ?? {});
  const d = parsed.success ? parsed.data : { packages: [] };
  return {
    ...(d.sender ? { sender: d.sender } : {}),
    ...(d.phone ? { phone: d.phone } : {}),
    ...(d.email ? { email: d.email } : {}),
    ...(d.pickup ? { pickup: d.pickup } : {}),
    ...(d.delivery ? { delivery: d.delivery } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    packages: d.packages.map((p) => ({ ...p, deadline: p.deadline ?? "" })),
  };
}

// ---------- Registro de herramientas ----------

type ToolResult = { text: string; data?: Record<string, unknown> };
type McpTool = {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  /** Solo se registra cuando la conexión trae un token de conductor válido. */
  driverOnly?: boolean;
  run: (ctx: BotContext, args: Record<string, unknown>, mcp: McpServer) => Promise<ToolResult>;
};

const str = (d: string) => z.string().describe(d);
const draftArg = { draft: draftInput.optional() };

// ---------- Imágenes: base64 o URL ----------

// SSRF guard: solo http(s) y nada de hosts privados/locales.
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|\[::1\]|.*\.(local|internal|lan)$)/i;

async function fetchImageUrl(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | { error: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { error: "imagen_url inválida" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    return { error: "imagen_url solo admite http/https" };
  if (PRIVATE_HOST.test(u.hostname)) return { error: "esa imagen_url no es accesible" };
  const res = await fetch(u, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return { error: "no pude descargar la imagen de esa URL" };
  const mime = (res.headers.get("content-type") ?? "").split(";")[0] ?? "";
  if (!IMAGE_TYPES.has(mime)) return { error: "la URL no apunta a una imagen jpg/png/webp" };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) return { error: "la imagen está vacía" };
  if (bytes.byteLength > MAX_IMAGE) return { error: "la imagen pasa de 5 MB" };
  return { bytes, contentType: mime };
}

/** Estima el bulto con el modelo del CLIENTE via MCP sampling
 * (sampling/createMessage). Solo si el cliente declaró la capacidad y el
 * modelo responde algo parseable; si no, devuelve null y se cae a Gemini. */
async function estimateViaSampling(
  server: McpServer,
  image: { base64: string; contentType: string },
): Promise<Record<string, unknown> | null> {
  try {
    if (!server.server.getClientCapabilities?.()?.sampling) return null;
    const res = await server.server.createMessage({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", data: image.base64, mimeType: image.contentType },
            { type: "text", text: ESTIMATE_PROMPT },
          ],
        },
      ],
      maxTokens: 600,
    });
    const text = res.content.type === "text" ? res.content.text : "";
    return extractJsonObject(text);
  } catch {
    return null;
  }
}

/** Resuelve la imagen de una tool: imagen_url (se descarga) o imagen_base64. */
async function imageArg(
  args: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; contentType: string } | { error: string }> {
  const url = String(args["imagen_url"] ?? "").trim();
  if (url) return fetchImageUrl(url);
  const b64 = String(args["imagen_base64"] ?? "").trim();
  if (!b64) return { error: "Pasa la imagen como imagen_url o imagen_base64." };
  const mime = String(args["mime_type"] ?? "image/jpeg");
  if (!IMAGE_TYPES.has(mime)) return { error: "la imagen debe ser jpg, png o webp" };
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return { error: "la imagen en base64 no es válida" };
  }
  if (!bytes.byteLength) return { error: "la imagen está vacía" };
  if (bytes.byteLength > MAX_IMAGE) return { error: "la imagen pasa de 5 MB" };
  return { bytes, contentType: mime };
}

/** Ejecuta una tool compartida con un ctx que lleva el draft del cliente y
 * devuelve el texto + el draft actualizado para la próxima llamada. */
const mutating =
  (
    tool: string,
    mapArgs: (args: Record<string, unknown>) => Record<string, unknown>,
    needsOffer = false,
  ): McpTool["run"] =>
  async (ctx, args) => {
    ctx.flow.draft = toDraft(args["draft"]);
    const offerId = needsOffer ? String(args["offer_id"] ?? "") : "";
    if (offerId) ctx.flow.offer_id = offerId;
    const text = await runTool(ctx, tool, mapArgs(args));
    return { text, data: { draft: ctx.flow.draft } };
  };

export const MCP_TOOLS: McpTool[] = [
  {
    name: "buscar_ofertas",
    description:
      "Busca viajes con espacio libre en la bolsa. Filtra por ciudad de origen y/o destino (nombre o slug, ej. 'maracay'). Devuelve los offer_id para usar en las demás herramientas.",
    schema: {
      origen: str("Ciudad de salida (nombre o slug), opcional").optional(),
      destino: str("Ciudad de llegada (nombre o slug), opcional").optional(),
    },
    run: async (_ctx, args) => {
      const slug = (v: unknown) => {
        const s = String(v ?? "")
          .trim()
          .toLowerCase();
        if (!s) return null;
        return (
          CITIES.find((c) => c.id === s || c.name.toLowerCase() === s)?.id ??
          (s.length >= 2 ? s : null)
        );
      };
      let q = publicClient(process.env["SUPABASE_URL"], process.env["SUPABASE_PUBLISHABLE_KEY"])
        .from("return_offers")
        .select(PUBLIC_OFFER_COLUMNS)
        .eq("active", true)
        .order("available_date", { ascending: true })
        .limit(15);
      const o = slug(args["origen"]);
      const d = slug(args["destino"]);
      if (o) q = q.eq("origin", o);
      if (d) q = q.eq("destination", d);
      const { data, error } = await q;
      if (error) return { text: `No se pudo buscar: ${error.message}` };
      const offers = ((data ?? []) as PublicOffer[]).filter((x) => !offerDeparted(x));
      if (!offers.length)
        return {
          text: "No hay viajes con espacio para ese filtro. Prueba otra ciudad o sin filtro.",
        };
      const lines = offers.map((x) => `- ${x.id} · ${describeOffer(x)}`);
      return {
        text: `Viajes encontrados (${offers.length}):\n${lines.join("\n")}`,
        data: { offers: offers as unknown as Record<string, unknown>[] },
      };
    },
  },
  {
    name: "ver_oferta",
    description: "Datos de la oferta de espacio en camión (ruta, fecha, espacio libre en m³ y kg).",
    schema: { offer_id: str("ID de la oferta de la bolsa").uuid() },
    run: async (ctx, args) => {
      ctx.flow.offer_id = String(args["offer_id"]);
      return { text: await runTool(ctx, "ver_oferta", {}) };
    },
  },
  {
    name: "guardar_contacto",
    description:
      "Guarda en el borrador los datos de contacto del solicitante. Devuelve el borrador actualizado.",
    schema: {
      ...draftArg,
      sender: str("Nombre y apellido").optional(),
      phone: str("Teléfono o WhatsApp").optional(),
      email: str("Correo electrónico").optional(),
    },
    run: mutating("guardar_contacto", (a) => ({
      ...(a["sender"] ? { sender: a["sender"] } : {}),
      ...(a["phone"] ? { phone: a["phone"] } : {}),
      ...(a["email"] ? { email: a["email"] } : {}),
    })),
  },
  {
    name: "guardar_direcciones",
    description:
      "Guarda la dirección de recogida y/o entrega en el borrador. Valida cada dirección en el mapa y que esté sobre la ruta del viaje; si la rechaza explica el motivo (dirección no encontrada o fuera del corredor).",
    schema: {
      offer_id: str("ID de la oferta (necesario para validar contra la ruta)").uuid(),
      ...draftArg,
      pickup: str("Dirección donde se recoge la carga").optional(),
      delivery: str("Dirección donde se entrega").optional(),
    },
    run: mutating(
      "guardar_direcciones",
      (a) => ({
        ...(a["pickup"] ? { pickup: a["pickup"] } : {}),
        ...(a["delivery"] ? { delivery: a["delivery"] } : {}),
      }),
      true,
    ),
  },
  {
    name: "agregar_bulto",
    description:
      "Agrega un bulto a la carga (cm y kg). Si el borrador ya tiene un bulto con el mismo nombre lo reemplaza (corrección de cantidad o medidas, no duplicado).",
    schema: {
      ...draftArg,
      name: str("Descripción corta, ej. 'Caja con libros'"),
      length: z.number().describe("Largo en cm"),
      width: z.number().describe("Ancho en cm"),
      height: z.number().describe("Alto en cm"),
      weight: z.number().describe("Peso por bulto en kg"),
      qty: z.number().int().describe("Cantidad").default(1),
      fragile: z.boolean().describe("Si es frágil").default(false),
    },
    run: mutating("agregar_bulto", (a) => ({
      name: a["name"],
      length: a["length"],
      width: a["width"],
      height: a["height"],
      weight: a["weight"],
      qty: a["qty"] ?? 1,
      fragile: a["fragile"] ?? false,
    })),
  },
  {
    name: "quitar_bulto",
    description: "Quita un bulto del borrador por su número (1 en adelante).",
    schema: { ...draftArg, index: z.number().int().describe("Número del bulto a quitar") },
    run: mutating("quitar_bulto", (a) => ({ index: a["index"] })),
  },
  {
    name: "agregar_nota",
    description: "Guarda notas o instrucciones para el conductor en el borrador.",
    schema: { ...draftArg, notes: str("Notas para el conductor") },
    run: mutating("agregar_nota", (a) => ({ notes: a["notes"] })),
  },
  {
    name: "ver_borrador",
    description: "Resumen de todo lo recolectado hasta ahora en el borrador.",
    schema: { ...draftArg },
    run: async (_ctx, args) => ({ text: draftSummary(toDraft(args["draft"])) }),
  },
  {
    name: "enviar_solicitud",
    description:
      "Envía la solicitud de espacio al conductor con el borrador completo (contacto, direcciones y bultos). Solo después de que el usuario confirme el resumen. Devuelve el request_id y la página de pago.",
    schema: { offer_id: str("ID de la oferta").uuid(), draft: draftInput },
    run: async (ctx, args) => {
      ctx.flow.offer_id = String(args["offer_id"]);
      ctx.flow.draft = toDraft(args["draft"]);
      const text = await runTool(ctx, "enviar_solicitud", {});
      return {
        text,
        data: { ...(ctx.flow.request_id ? { request_id: ctx.flow.request_id } : {}) },
      };
    },
  },
  {
    name: "estado_solicitud",
    description:
      "Estado de una solicitud enviada: pendiente, por pagar, comprobante en revisión, pagada, rechazada o vencida.",
    schema: { request_id: str("ID de la solicitud").uuid() },
    run: async (ctx, args) => {
      ctx.flow.request_id = String(args["request_id"]);
      return { text: await runTool(ctx, "estado_solicitud", {}) };
    },
  },
  {
    name: "datos_de_pago",
    description:
      "Datos del pago móvil de la plataforma y el monto en bolívares a tasa BCV cuando la solicitud fue aceptada. Incluye el payload del QR en texto.",
    schema: { request_id: str("ID de la solicitud").uuid() },
    run: async (ctx, args) => {
      ctx.flow.request_id = String(args["request_id"]);
      return { text: await runTool(ctx, "datos_de_pago", {}) };
    },
  },
  {
    name: "lugares_para_embalar",
    description:
      "Sitios cercanos donde embalar o enviar paquetes (agencias de envío, correo) con enlace de Google Maps.",
    schema: {
      query: str("Ciudad o zona de referencia, opcional").optional(),
      lat: z.number().describe("Latitud, si el usuario compartió su ubicación").optional(),
      lng: z.number().describe("Longitud, si el usuario compartió su ubicación").optional(),
    },
    run: async (ctx, args) => {
      const lat = Number(args["lat"]);
      const lng = Number(args["lng"]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) ctx.flow.location = { lat, lng };
      const q = typeof args["query"] === "string" && args["query"].trim() ? args["query"] : {};
      return { text: await runTool(ctx, "lugares_para_embalar", { query: q }) };
    },
  },
  {
    name: "estimar_bulto",
    description:
      "Estima descripción, medidas ya embaladas (cm) y peso (kg) de un objeto a partir de una foto (imagen_url pública o imagen_base64). Usa el modelo del cliente MCP si este declara sampling; si no, la visión del servidor. Devuelve la estimación para agregarla luego con agregar_bulto tras confirmarla con el usuario.",
    schema: {
      imagen_url: str("URL pública de la foto (jpg, png o webp, máx. ~5 MB)").optional(),
      imagen_base64: str("Foto codificada en base64").optional(),
      mime_type: str("Tipo MIME si pasas base64").default("image/jpeg"),
    },
    run: async (_ctx, args, mcp) => {
      const image = await imageArg(args);
      if ("error" in image) return { text: image.error };
      const base64 =
        typeof Buffer !== "undefined"
          ? Buffer.from(image.bytes).toString("base64")
          : btoa(String.fromCharCode(...image.bytes));
      const params = { base64, contentType: image.contentType };
      // Primero el modelo del cliente (sampling); fallback a Gemini del server.
      let result = await estimateViaSampling(mcp, params);
      const via = result ? "cliente" : "gemini";
      result ??= await estimateFromImage(params, ESTIMATE_PROMPT);
      if (!result || result["error"])
        return {
          text: `No pude estimar medidas con esa foto${result?.["error"] ? ` (${String(result["error"])})` : ""}.`,
        };
      return {
        text: "Estimación lista. Confírmala con el usuario y luego guárdala con agregar_bulto.",
        data: { estimate: result, via },
      };
    },
  },
  {
    name: "subir_comprobante",
    description:
      "Sube la foto del comprobante de pago móvil de una solicitud aceptada (estado por pagar). La imagen va como imagen_url pública o imagen_base64 (jpg, png o webp, máx. 5 MB); se guarda en el bucket privado y se confirma el pago.",
    schema: {
      request_id: str("ID de la solicitud").uuid(),
      imagen_url: str("URL pública de la foto del comprobante").optional(),
      imagen_base64: str("Foto del comprobante codificada en base64").optional(),
      mime_type: str("Tipo MIME si pasas base64").default("image/jpeg"),
    },
    run: async (_ctx, args) => {
      const reqId = String(args["request_id"] ?? "");
      const image = await imageArg(args);
      if ("error" in image) return { text: image.error };
      return { text: await submitProofBytes(reqId, image) };
    },
  },
  {
    name: "solicitudes_pendientes",
    description:
      "CONDUCTOR: lista las solicitudes pendientes de tus viajes (id, solicitante, recogida, entrega, bultos).",
    schema: {},
    driverOnly: true,
    run: async (ctx) => {
      const { data, error } = await serviceClient()
        .from("package_requests")
        .select(
          "id, sender_name, pickup_address, delivery_address, package, created_at, trips!inner(user_id, origin, destination, departure_date)",
        )
        .eq("status", "pending")
        .eq("trips.user_id", ctx.userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return { text: `No se pudo consultar: ${error.message}` };
      if (!data?.length) return { text: "No hay solicitudes pendientes." };
      const lines = data.map((r) => {
        const t = r.trips as { origin?: string; destination?: string; departure_date?: string };
        const pkgs = Array.isArray(r.package) ? r.package : [];
        const items = pkgs
          .map((p) => {
            const b = p as Record<string, unknown>;
            return `${Number(b["qty"] ?? 1)}× ${String(b["name"] ?? "bulto")}`;
          })
          .join(", ");
        return `- id ${r.id} · ${r.sender_name} · ${r.pickup_address} → ${r.delivery_address} · ${t.origin}→${t.destination} ${t.departure_date} · ${items}`;
      });
      return {
        text: `Solicitudes pendientes (${data.length}):\n${lines.join("\n")}`,
        data: { requests: data as unknown as Record<string, unknown>[] },
      };
    },
  },
  {
    name: "decidir_solicitud",
    description:
      "CONDUCTOR: acepta (con monto en USD) o rechaza una solicitud de tus viajes. Al aceptar, el solicitante recibe los datos de pago.",
    schema: {
      request_id: str("ID de la solicitud").uuid(),
      accept: z.boolean().describe("true acepta, false rechaza"),
      amount_usd: z.number().describe("Monto en USD (obligatorio al aceptar)").optional(),
    },
    driverOnly: true,
    run: async (ctx, args) => {
      const text = await runTool(ctx, "decidir_solicitud", args);
      const monto =
        args["amount_usd"] != null ? ` por $${formatUsd(Number(args["amount_usd"]))}` : "";
      return { text, data: { request_id: args["request_id"], accept: args["accept"], monto } };
    },
  },
];

/**
 * Crea el servidor MCP por request (transporte stateless). Sin token de
 * conductor no se registran las herramientas de conductor.
 */
export function createMcpServer(userId: string | null): McpServer {
  const server = new McpServer(
    { name: "cargaruta", version: "1.0.0" },
    {
      instructions:
        "CargaRuta conecta personas que envían encomiendas con camioneros con espacio libre en Venezuela. Flujo del solicitante: ver_oferta → recolectar datos con guardar_contacto/guardar_direcciones/agregar_bulto sobre el draft → ver_borrador → confirmar con el usuario → enviar_solicitud → datos_de_pago/estado_solicitud. El draft viaja contigo: pásalo completo en cada llamada. Las direcciones deben estar sobre la ruta del viaje (guardar_direcciones lo valida). Con token de conductor: solicitudes_pendientes y decidir_solicitud.",
    },
  );
  // registerTool infiere ShapeOutput del esquema y con un Record genérico
  // revienta el checker (TS2589); el SDK igual valida los args en runtime.
  type Register = (
    name: string,
    config: { description: string; inputSchema: z.ZodRawShape },
    cb: (args: Record<string, unknown>) => Promise<unknown>,
  ) => unknown;
  const register = server.registerTool.bind(server) as Register;
  for (const tool of MCP_TOOLS) {
    if (tool.driverOnly && !userId) continue;
    register(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (args) => {
        const ctx: BotContext = { chatId: 0, flow: {}, ...(userId ? { userId } : {}) };
        try {
          const { text, data } = await tool.run(ctx, args as Record<string, unknown>, server);
          return {
            content: [{ type: "text" as const, text }],
            ...(data ? { structuredContent: data } : {}),
          };
        } catch (e) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error en ${tool.name}: ${e instanceof Error ? e.message : "falló"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
