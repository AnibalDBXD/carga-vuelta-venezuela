// Herramientas del asistente (bot de Telegram hoy, MCP en fase 2): cada tool
// opera sobre un BotContext con el estado del chat y delega en los mismos RPCs
// públicos/capability que usa la web. Solo corre en servidor.
// Spec: specs/003-telegram.md.

import { z } from "zod";
import qrcode from "qrcode-generator";
import type { Json } from "@/integrations/supabase/types";
import { publicClient, serviceClient, notifyDriverOfRequest } from "./package-requests.functions";
import {
  offerRequestSchema,
  PUBLIC_OFFER_COLUMNS,
  clientTotalUsd,
  type PublicOffer,
} from "./package-request";
import { offerDeparted } from "./offer-time";
import { CITIES, cityName, nearestCity, suggestStops } from "./venezuela";
import { getBcvRate } from "./bcv";
import { formatBs, formatUsd, pagoMovilQrPayload, bankName } from "./pago-movil";
import { fetchDirections, geocodePoint, parseMapPoint } from "./mapbox";
import { corridorProjection, distanceToLine, type LngLat } from "./route-geometry";
import { getFilePath, downloadFile, sendPhoto, type TgInlineButton } from "./telegram";
import { estimateFromImage } from "./assistant";
import { appUrl } from "./notify";
import {
  notifyRequesterAccepted,
  notifyRequesterPaidCore,
  notifyDriverOfProof,
} from "./payments.functions";

// ---------- Estado del chat ----------

export type DraftPkg = {
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  qty: number;
  fragile: boolean;
  deadline: string;
};

export type Draft = {
  sender?: string;
  phone?: string;
  email?: string;
  pickup?: string;
  delivery?: string;
  notes?: string;
  packages: DraftPkg[];
};

export type Flow = {
  offer_id?: string;
  request_id?: string;
  draft?: Draft;
  /** Bulto estimado por foto esperando confirmación del usuario. */
  pending_estimate?: DraftPkg;
  /** request_id pendiente de monto cuando el conductor acepta por chat. */
  driver_amount_for?: string;
  /** Última ubicación compartida (para "¿dónde embalo esto?"). */
  location?: { lng: number; lat: number };
  /** Nombre visible en Telegram (referencia; no es el nombre de la solicitud). */
  tg_name?: string;
};

export type BotContext = {
  chatId: number;
  flow: Flow;
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function loadSession(
  chatId: number,
): Promise<{ flow: Flow; history: { role: "user" | "assistant"; content: string }[] }> {
  const { data } = await serviceClient()
    .from("telegram_sessions")
    .select("flow, history, updated_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return { flow: {}, history: [] };
  const stale = Date.now() - new Date(data.updated_at as string).getTime() > SESSION_TTL_MS;
  if (stale) return { flow: {}, history: [] };
  return {
    flow: (data.flow ?? {}) as Flow,
    history: (data.history ?? []) as { role: "user" | "assistant"; content: string }[],
  };
}

export async function saveSession(
  chatId: number,
  flow: Flow,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  const { error } = await serviceClient()
    .from("telegram_sessions")
    .upsert({
      chat_id: chatId,
      flow: flow as unknown as NonNullable<Json>,
      history: history.slice(-12),
      updated_at: new Date().toISOString(),
    });
  if (error) console.error("[tg-session]", error.message);
}

// ---------- Vínculos chat ↔ app ----------

export async function linkChatToRequest(chatId: number, requestId: string): Promise<boolean> {
  const { data: req } = await serviceClient()
    .from("package_requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return false;
  const { error } = await serviceClient()
    .from("telegram_chats")
    .upsert({ chat_id: chatId, request_id: requestId }, { onConflict: "chat_id,request_id" });
  return !error;
}

export async function linkChatToDriver(
  chatId: number,
  token: string,
): Promise<"linked" | "invalid"> {
  const admin = serviceClient();
  const { data: row } = await admin
    .from("telegram_link_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("id", token)
    .maybeSingle();
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return "invalid";
  const { error } = await admin
    .from("telegram_chats")
    .upsert({ chat_id: chatId, user_id: row.user_id }, { onConflict: "chat_id,user_id" });
  if (error) return "invalid";
  await admin
    .from("telegram_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);
  return "linked";
}

/** Último request vinculado al chat (para comprobante/estado cuando hay varios). */
export async function resolveRequestForChat(chatId: number): Promise<string | null> {
  const { data } = await serviceClient()
    .from("telegram_chats")
    .select("request_id, created_at")
    .eq("chat_id", chatId)
    .not("request_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.request_id as string | null) ?? null;
}

export async function driverLinked(chatId: number): Promise<boolean> {
  const { data } = await serviceClient()
    .from("telegram_chats")
    .select("id")
    .eq("chat_id", chatId)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// ---------- Datos compartidos con la web ----------

export async function fetchOffer(offerId: string): Promise<PublicOffer | null> {
  const { data: offer, error } = await publicClient(
    process.env["SUPABASE_URL"],
    process.env["SUPABASE_PUBLISHABLE_KEY"],
  )
    .from("return_offers")
    .select(PUBLIC_OFFER_COLUMNS)
    .eq("id", offerId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("No se pudo consultar el viaje");
  if (offer && offerDeparted(offer)) return null;
  return offer as PublicOffer | null;
}

export function describeOffer(o: PublicOffer): string {
  return `${cityName(o.origin)} → ${cityName(o.destination)} · ${o.available_date}${o.available_time ? ` ${o.available_time.slice(0, 5)}` : ""} · ${o.driver_name} · ${o.free_m3} m³ y ${o.free_kg} kg libres`;
}

export type PaymentSummaryRow = {
  origin: string;
  destination: string;
  departure_date: string;
  vehicle_kind: string | null;
  package: unknown;
  sender_name: string;
  amount_usd: number | null;
  total_usd: number | null;
  status: string;
  has_proof: boolean;
  payment_expires_at: string | null;
};

export async function fetchPaymentSummary(requestId: string): Promise<PaymentSummaryRow | null> {
  const { data, error } = await publicClient(
    process.env["SUPABASE_URL"],
    process.env["SUPABASE_PUBLISHABLE_KEY"],
  ).rpc("payment_summary", { p_request: requestId });
  if (error) throw new Error("No se pudo consultar el pago");
  return (data as PaymentSummaryRow | null) ?? null;
}

function platformPaymentMethod() {
  const bank = process.env["PAGO_MOVIL_BANK"];
  const phone = process.env["PAGO_MOVIL_PHONE"];
  const document = process.env["PAGO_MOVIL_DOCUMENT"];
  const holder = process.env["PAGO_MOVIL_HOLDER"];
  return bank && phone && document && holder ? { bank, phone, document, holder } : null;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "pendiente de que el conductor la revise",
  awaiting_payment: "aceptada: falta el pago",
  payment_review: "comprobante recibido, verificando el pago",
  paid: "pagada. Tu carga ya está montada en el viaje",
  rejected: "rechazada por el conductor",
  expired: "vencida (el viaje salió o pasó el plazo)",
};

// ---------- Utilidades de envío ----------

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE = 5 * 1024 * 1024;

async function fetchTelegramImage(
  fileId: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const path = await getFilePath(fileId);
  const file = await downloadFile(path);
  const mime = file.contentType.split(";")[0] ?? "";
  if (!IMAGE_TYPES.has(mime) && !/\.(jpe?g|png|webp)$/i.test(path)) return null;
  if (file.bytes.byteLength > MAX_IMAGE) return null;
  return { bytes: file.bytes, contentType: IMAGE_TYPES.has(mime) ? mime : "image/jpeg" };
}

/** QR del pago móvil como GIF (qrcode-generator genera data:image/gif;base64). */
function pagoMovilQrGif(
  payload: string,
): { data: Uint8Array; filename: string; contentType: string } | null {
  try {
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    const dataUrl = qr.createDataURL(6, 4);
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return {
      data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
      filename: "pago-movil.gif",
      contentType: "image/gif",
    };
  } catch {
    return null;
  }
}

export function draftSummary(d: Draft): string {
  const pkg = d.packages
    .map(
      (p, i) =>
        `  ${i + 1}) ${p.name}: ${p.qty} × ${p.length}×${p.width}×${p.height} cm, ${p.weight} kg c/u${p.fragile ? ", frágil" : ""}`,
    )
    .join("\n");
  return [
    `Nombre: ${d.sender ?? "—"}`,
    `Teléfono: ${d.phone ?? "—"}`,
    `Correo: ${d.email ?? "—"}`,
    `Recogida: ${d.pickup ?? "—"}`,
    `Entrega: ${d.delivery ?? "—"}`,
    d.notes ? `Notas: ${d.notes}` : null,
    `Bultos:\n${pkg || "  (ninguno)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Definición de tools (function calling) ----------

export const TOOL_DEFS = [
  {
    name: "ver_oferta",
    description:
      "Muestra los datos de la oferta de espacio en camión (ruta, fecha, espacio libre).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "guardar_contacto",
    description:
      "Guarda los datos de contacto del solicitante. Solo incluye los campos que el usuario dio.",
    parameters: {
      type: "object",
      properties: {
        sender: { type: "string", description: "Nombre y apellido" },
        phone: { type: "string", description: "Teléfono o WhatsApp" },
        email: { type: "string", description: "Correo electrónico" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "guardar_direcciones",
    description:
      "Guarda la dirección de recogida y/o la de entrega (texto libre con ciudad, sector, calle, referencia). Valida cada dirección en el mapa y que esté sobre la ruta del viaje; si la rechaza, explica el motivo al usuario y pide otra.",
    parameters: {
      type: "object",
      properties: {
        pickup: { type: "string", description: "Dirección donde se recoge la carga" },
        delivery: { type: "string", description: "Dirección donde se entrega" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "agregar_bulto",
    description:
      "Agrega un bulto a la carga con medidas en centímetros y peso en kilogramos. Si ya existe un bulto con el mismo nombre, lo REEMPLAZA (útil cuando el usuario corrige cantidad o medidas — nunca sumes ni dupliques).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Descripción corta, ej. 'Caja con libros'" },
        length: { type: "number", description: "Largo en cm" },
        width: { type: "number", description: "Ancho en cm" },
        height: { type: "number", description: "Alto en cm" },
        weight: { type: "number", description: "Peso de cada bulto en kg" },
        qty: { type: "integer", description: "Cantidad de bultos iguales", default: 1 },
        fragile: { type: "boolean", description: "Si es frágil", default: false },
      },
      required: ["name", "length", "width", "height", "weight", "qty", "fragile"],
      additionalProperties: false,
    },
  },
  {
    name: "quitar_bulto",
    description: "Quita un bulto del borrador por su número (1 en adelante).",
    parameters: {
      type: "object",
      properties: { index: { type: "integer", description: "Número del bulto a quitar" } },
      required: ["index"],
      additionalProperties: false,
    },
  },
  {
    name: "agregar_nota",
    description: "Guarda notas o instrucciones para el conductor (opcional).",
    parameters: {
      type: "object",
      properties: { notes: { type: "string" } },
      required: ["notes"],
      additionalProperties: false,
    },
  },
  {
    name: "ver_borrador",
    description: "Muestra todo lo recolectado hasta ahora de la solicitud.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "enviar_solicitud",
    description:
      "Envía la solicitud de espacio al conductor. SOLO después de que el usuario confirme el resumen completo.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "estado_solicitud",
    description:
      "Consulta el estado de la solicitud ya enviada (pendiente, por pagar, pagada, etc.).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "datos_de_pago",
    description:
      "Muestra los datos de pago móvil y el monto en bolívares a tasa BCV cuando la solicitud fue aceptada.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "lugares_para_embalar",
    description:
      "Busca sitios cercanos donde embalar o enviar paquetes (agencias de envío, correo). Usa la ubicación del usuario si la compartió, si no geocodifica la dirección de recogida.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Ciudad o zona de referencia, opcional" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "decidir_solicitud",
    description:
      "SOLO PARA EL CONDUCTOR: acepta (con monto en USD) o rechaza una solicitud de carga.",
    parameters: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "ID de la solicitud" },
        accept: { type: "boolean" },
        amount_usd: {
          type: "number",
          description: "Monto en USD si acepta (obligatorio al aceptar)",
        },
      },
      required: ["request_id", "accept"],
      additionalProperties: false,
    },
  },
];

// ---------- Ejecución de tools ----------

export function ensureDraft(flow: Flow): Draft {
  flow.draft ??= { packages: [] };
  return flow.draft;
}

const draftPkgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  length: z.number().positive().max(10000),
  width: z.number().positive().max(10000),
  height: z.number().positive().max(10000),
  weight: z.number().positive().max(10000),
  qty: z.number().int().min(1).max(100),
  fragile: z.boolean(),
  deadline: z.string(),
});

/** Clave para detectar el mismo bulto re-descrito (corrección ≠ nuevo bulto). */
const normPkgName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Agrega un bulto al borrador, o reemplaza el existente con el mismo nombre
 * (el usuario que re-describe un bulto lo corrige, no añade otro). Devuelve
 * el índice (0-based) y si fue nuevo o reemplazo.
 */
export function upsertDraftPkg(
  d: Draft,
  pkg: DraftPkg,
): { index: number; result: "added" | "replaced"; before?: DraftPkg } {
  const prev = d.packages.findIndex((p) => normPkgName(p.name) === normPkgName(pkg.name));
  if (prev >= 0) {
    const before = d.packages[prev]!;
    d.packages[prev] = pkg;
    return { index: prev, result: "replaced", before };
  }
  d.packages.push(pkg);
  return { index: d.packages.length - 1, result: "added" };
}

// Distancia máxima a la ruta del viaje para aceptar una recogida/entrega, y
// holgura antes/después de los extremos (un punto con t fuera queda detrás
// del origen o más allá del destino — el camión no pasa por ahí).
const MAX_OFFROUTE_KM = 30;
const T_MARGIN = 0.15;

/**
 * Valida una dirección del usuario: que el geocodificador la encuentre (dirección
 * real) y que caiga sobre el corredor del viaje (geometría real de Directions si
 * hay token, si no el eje origen→destino). Devuelve la ciudad más cercana para
 * que el modelo la confirme con el usuario.
 */
async function checkAddressOnRoute(
  offer: PublicOffer,
  address: string,
): Promise<{ ok: true; near: string } | { ok: false; reason: string }> {
  const point = parseMapPoint(address) ?? (await geocodePoint(address));
  if (!point)
    return {
      ok: false,
      reason: `no encuentro "${address}" en el mapa — pide una dirección más concreta (ciudad, sector, calle o un punto de referencia conocido)`,
    };
  const a = CITIES.find((c) => c.id === offer.origin);
  const b = CITIES.find((c) => c.id === offer.destination);
  const near = nearestCity(point[0], point[1]);
  if (!a || !b) return { ok: true, near: near?.name ?? address };
  let dKm: number;
  let t: number;
  const real = await fetchDirections(offer.origin, offer.destination).catch(() => null);
  if (real && real.geometry.coordinates.length >= 2) {
    ({ dKm, t } = distanceToLine(real.geometry, point));
  } else {
    ({ dKm, t } = corridorProjection([a.lng, a.lat] as LngLat, [b.lng, b.lat] as LngLat, point));
  }
  if (dKm <= MAX_OFFROUTE_KM && t >= -T_MARGIN && t <= 1 + T_MARGIN)
    return { ok: true, near: near?.name ?? address };
  const corridor = [a, ...suggestStops(offer.origin, offer.destination), b]
    .map((c) => c.name)
    .join(", ");
  return {
    ok: false,
    reason: `"${address}" queda cerca de ${near?.name ?? "otro punto"}, a ${Math.round(dKm)} km de la ruta ${a.name} → ${b.name}: el camión no pasa por ahí. La ruta pasa por ${corridor} — pide una dirección en esa ruta`,
  };
}

export async function runTool(
  ctx: BotContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "ver_oferta": {
      if (!ctx.flow.offer_id) return "No hay una oferta activa en este chat.";
      const offer = await fetchOffer(ctx.flow.offer_id);
      return offer ? describeOffer(offer) : "Esta oferta ya no admite solicitudes.";
    }
    case "guardar_contacto": {
      const d = ensureDraft(ctx.flow);
      if (typeof args["sender"] === "string") d.sender = args["sender"];
      if (typeof args["phone"] === "string") d.phone = args["phone"];
      if (typeof args["email"] === "string") d.email = args["email"].toLowerCase();
      return `Guardado. Contacto ahora: ${d.sender ?? "—"} / ${d.phone ?? "—"} / ${d.email ?? "—"}`;
    }
    case "guardar_direcciones": {
      const d = ensureDraft(ctx.flow);
      const offer = ctx.flow.offer_id ? await fetchOffer(ctx.flow.offer_id) : null;
      const problems: string[] = [];
      const resolved: string[] = [];
      for (const [field, label] of [
        ["pickup", "recogida"],
        ["delivery", "entrega"],
      ] as const) {
        const raw = args[field];
        if (typeof raw !== "string" || !raw.trim()) continue;
        const value = raw.trim();
        if (offer) {
          const check = await checkAddressOnRoute(offer, value);
          if (!check.ok) {
            problems.push(`${label}: ${check.reason}`);
            continue;
          }
          resolved.push(`${label} en ${check.near}`);
        }
        d[field] = value;
      }
      if (problems.length)
        return `No guardé ${problems.length === 2 ? "las direcciones" : "una dirección"}: ${problems.join(" · ")}\nExplícale el problema al usuario y pídele la corrección.`;
      return `Direcciones guardadas${resolved.length ? ` (${resolved.join(" · ")} — confirma que sean esas)` : ""}. Recogida: ${d.pickup ?? "—"} · Entrega: ${d.delivery ?? "—"}`;
    }
    case "agregar_bulto": {
      const d = ensureDraft(ctx.flow);
      const pkg: DraftPkg = {
        name: String(args["name"] ?? ""),
        length: Number(args["length"]),
        width: Number(args["width"]),
        height: Number(args["height"]),
        weight: Number(args["weight"]),
        qty: Number(args["qty"] ?? 1),
        fragile: Boolean(args["fragile"]),
        deadline: "",
      };
      const check = draftPkgSchema.safeParse(pkg);
      if (!check.success)
        return `Medidas inválidas (${check.error.issues[0]?.message ?? "revisa números"}). No se agregó.`;
      delete ctx.flow.pending_estimate;
      const { index, result, before } = upsertDraftPkg(d, pkg);
      if (result === "replaced")
        return `Bulto ${index + 1} actualizado (reemplazado): ${pkg.name} — ahora ${pkg.qty} × ${pkg.length}×${pkg.width}×${pkg.height} cm, ${pkg.weight} kg c/u (antes ${before?.qty ?? "?"}). Total: ${d.packages.length} tipo(s) de bulto. NO lo sumes: ya está reemplazado.`;
      return `Bulto ${index + 1} agregado: ${pkg.name} (${pkg.qty} × ${pkg.length}×${pkg.width}×${pkg.height} cm, ${pkg.weight} kg). Total: ${d.packages.length} tipo(s) de bulto.`;
    }
    case "quitar_bulto": {
      const d = ensureDraft(ctx.flow);
      const i = Number(args["index"]) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= d.packages.length)
        return `No existe el bulto ${args["index"]}.`;
      const [removed] = d.packages.splice(i, 1);
      return `Quitado: ${removed?.name}. Quedan ${d.packages.length} tipo(s) de bulto.`;
    }
    case "agregar_nota": {
      const d = ensureDraft(ctx.flow);
      d.notes = String(args["notes"] ?? "").slice(0, 2000);
      return "Nota guardada.";
    }
    case "ver_borrador": {
      const d = ctx.flow.draft;
      return d ? draftSummary(d) : "El borrador está vacío.";
    }
    case "enviar_solicitud": {
      if (!ctx.flow.offer_id) return "No hay una oferta activa en este chat.";
      const d = ctx.flow.draft;
      if (!d) return "El borrador está vacío: faltan todos los datos.";
      const parsed = offerRequestSchema.safeParse({
        ...d,
        offerId: ctx.flow.offer_id,
        notes: d.notes ?? "",
      });
      if (!parsed.success) {
        const missing = parsed.error.issues
          .map((i) => i.path.join("."))
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ");
        return `Faltan o sobran datos: ${missing}. Pídelos al usuario antes de enviar.`;
      }
      const { data: requestId, error } = await publicClient(
        process.env["SUPABASE_URL"],
        process.env["SUPABASE_PUBLISHABLE_KEY"],
      ).rpc("submit_offer_request", {
        p_offer: parsed.data.offerId,
        p_sender: parsed.data.sender,
        p_phone: parsed.data.phone,
        p_email: parsed.data.email,
        p_pickup: parsed.data.pickup,
        p_delivery: parsed.data.delivery,
        p_package: parsed.data.packages,
        p_notes: parsed.data.notes,
      });
      if (error || !requestId)
        return "No se pudo enviar. La oferta pudo haber cerrado; dilo al usuario.";
      ctx.flow.request_id = String(requestId);
      ctx.flow.draft = { packages: [] };
      await linkChatToRequest(ctx.chatId, String(requestId));
      try {
        await notifyDriverOfRequest(String(requestId));
      } catch (e) {
        console.error("[notify-driver]", e);
      }
      return `Solicitud enviada con ID ${requestId}. Queda pendiente de que el conductor la acepte. La página de pago del cliente es ${appUrl()}/pagos/${requestId}`;
    }
    case "estado_solicitud": {
      const reqId = ctx.flow.request_id ?? (await resolveRequestForChat(ctx.chatId));
      if (!reqId) return "Este chat no tiene una solicitud registrada.";
      const s = await fetchPaymentSummary(reqId);
      if (!s) return "No encontré esa solicitud.";
      const total = clientTotalUsd(s.amount_usd, s.total_usd);
      return `Solicitud ${reqId}: ${STATUS_TEXT[s.status] ?? s.status}. Viaje ${cityName(s.origin)} → ${cityName(s.destination)} (${s.departure_date})${total != null ? ` por $${formatUsd(total)} USD` : ""}.`;
    }
    case "datos_de_pago": {
      const reqId = ctx.flow.request_id ?? (await resolveRequestForChat(ctx.chatId));
      if (!reqId) return "Este chat no tiene una solicitud registrada.";
      const s = await fetchPaymentSummary(reqId);
      if (!s) return "No encontré esa solicitud.";
      if (
        s.status === "awaiting_payment" &&
        s.payment_expires_at &&
        new Date(s.payment_expires_at) < new Date()
      )
        return "El plazo para pagar venció. La solicitud quedó expirada.";
      if (s.status !== "awaiting_payment")
        return `La solicitud está ${STATUS_TEXT[s.status] ?? s.status}; ${s.status === "pending" ? "cuando el conductor la acepte aparecerán los datos de pago" : "no requiere pago ahora"}.`;
      const pm = platformPaymentMethod();
      if (!pm) return "Los datos de pago móvil aún no están configurados.";
      const total = clientTotalUsd(s.amount_usd, s.total_usd);
      if (total == null) return "El monto aún no está disponible.";
      let bs = "";
      try {
        const { rate } = await getBcvRate();
        const amountBs = Math.round(total * rate * 100) / 100;
        const gif = pagoMovilQrGif(pagoMovilQrPayload(pm, amountBs));
        if (gif) {
          await sendPhoto(ctx.chatId, gif, `QR pago móvil · Bs ${formatBs(amountBs)}`).catch(
            () => undefined,
          );
        }
        bs = `\nMonto: Bs ${formatBs(amountBs)} ($${formatUsd(total)} USD a tasa BCV ${formatBs(rate)})`;
      } catch {
        bs = `\nMonto: $${formatUsd(total)} USD (no pude consultar la tasa BCV; paga el equivalente en Bs)`;
      }
      return `Pago móvil:\nBanco: ${pm.bank} · ${bankName(pm.bank)}\nTeléfono: ${pm.phone}\nCédula/RIF: ${pm.document}\nTitular: ${pm.holder}${bs}\n\nCuando pagues, envíame la foto del comprobante por aquí. También puedes hacerlo en ${appUrl()}/pagos/${reqId}`;
    }
    case "lugares_para_embalar": {
      let point = ctx.flow.location;
      const query =
        typeof args["query"] === "string" && args["query"].trim()
          ? args["query"].trim()
          : undefined;
      const geo = async (address: string) => {
        const g = await geocodePoint(address); // [lng, lat]
        return g ? { lng: g[0], lat: g[1] } : undefined;
      };
      if (!point && query) point = await geo(query);
      if (!point && ctx.flow.draft?.pickup) point = await geo(ctx.flow.draft.pickup);
      const places = await findPackingPlaces(point ?? null, query);
      if (!places.length) {
        const q = encodeURIComponent(`agencia de envíos embalaje${query ? ` ${query}` : ""}`);
        return `No encontré sitios con datos. Prueba este mapa: https://www.google.com/maps/search/?api=1&query=${q}`;
      }
      const lines = places.map(
        (p, i) => `${i + 1}. ${p.name}${p.address ? ` — ${p.address}` : ""}\n   ${p.mapsUrl}`,
      );
      return `Sitios para embalar/enviar cerca:\n${lines.join("\n")}`;
    }
    case "decidir_solicitud": {
      if (!(await driverLinked(ctx.chatId))) return "Este chat no está vinculado a un conductor.";
      const requestId = String(args["request_id"] ?? "");
      const accept = Boolean(args["accept"]);
      const amount = args["amount_usd"] != null ? Number(args["amount_usd"]) : null;
      const { data, error } = await serviceClient().rpc("decide_package_request_bot", {
        p_chat_id: ctx.chatId,
        p_request: requestId,
        p_accept: accept,
        ...(amount != null ? { p_amount: amount } : {}),
      });
      if (error) return `No se pudo: ${error.message}`;
      if (accept) {
        try {
          await notifyRequesterAccepted(requestId);
        } catch (e) {
          console.error("[notify-requester]", e);
        }
        return `Solicitud aceptada por $${formatUsd(Number(amount))} USD. El solicitante ya fue avisado para pagar.`;
      }
      return `Solicitud rechazada (estado: ${data}).`;
    }
    default:
      return `Herramienta desconocida: ${name}`;
  }
}

// ---------- Búsqueda de lugares de embalaje ----------

type Place = { name: string; address?: string; mapsUrl: string };

async function findPackingPlaces(
  point: { lng: number; lat: number } | null,
  query?: string,
): Promise<Place[]> {
  const token = process.env["MAPBOX_TOKEN"] || process.env["VITE_MAPBOX_TOKEN"];
  if (!token || !point) return [];
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.search = new URLSearchParams({
    access_token: token,
    q: query ? `envíos embalaje ${query}` : "agencia de envíos embalaje paquetería",
    country: "ve",
    language: "es",
    limit: "5",
    types: "poi",
    proximity: `${point.lng},${point.lat}`,
  }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: {
        properties?: { name?: string; full_address?: string; place_formatted?: string };
        geometry?: { coordinates?: [number, number] };
      }[];
    };
    return (json.features ?? []).slice(0, 3).flatMap((f): Place[] => {
      const name = f.properties?.name ?? "";
      if (!name) return [];
      const c = f.geometry?.coordinates;
      const mapsUrl = c
        ? `https://www.google.com/maps/search/?api=1&query=${c[1]},${c[0]}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
      const address = f.properties?.full_address ?? f.properties?.place_formatted;
      return [{ name, ...(address ? { address } : {}), mapsUrl }];
    });
  } catch {
    return [];
  }
}

// ---------- Fotos: estimación de bulto y comprobante ----------

const ESTIMATE_PROMPT = `Eres experto en logística de encomiendas en Venezuela. Mira la foto del objeto que alguien quiere enviar y estima sus medidas YA EMBALADO para transporte.
Responde SOLO un JSON con: name (descripción corta en español), length, width, height (largo/ancho/alto en cm), weight (peso estimado en kg), fragile (boolean), confidence ("alta"|"media"|"baja"), notes (una frase corta si la estimación es incierta).
Usa objetos de referencia comunes: un teclado estándar ~45×14×3 cm ~0.8 kg; una silla ~50×50×100 cm ~7 kg; caja de zapatos ~35×22×13 cm ~1 kg. Si no puedes estimar, responde {"error":"motivo"}.`;

export async function estimatePackagePhoto(
  ctx: BotContext,
  fileId: string,
): Promise<{ text: string; buttons?: TgInlineButton[][] }> {
  const image = await fetchTelegramImage(fileId).catch(() => null);
  if (!image)
    return { text: "No pude leer esa imagen. Envíala como foto (jpg, png o webp, máx. 5 MB)." };
  const base64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(image.bytes).toString("base64")
      : btoa(String.fromCharCode(...image.bytes));
  const result = await estimateFromImage(
    { base64, contentType: image.contentType },
    ESTIMATE_PROMPT,
  );
  if (!result || result["error"]) {
    return {
      text: `No pude estimar medidas con esa foto${result?.["error"] ? ` (${String(result["error"])})` : ""}. Dime las medidas aproximadas en cm y el peso, o prueba otra foto.`,
    };
  }
  const pkg: DraftPkg = {
    name: String(result["name"] ?? "Mi carga").slice(0, 200) || "Mi carga",
    length: Number(result["length"]) || 0,
    width: Number(result["width"]) || 0,
    height: Number(result["height"]) || 0,
    weight: Number(result["weight"]) || 0,
    qty: 1,
    fragile: Boolean(result["fragile"]),
    deadline: "",
  };
  if (!(pkg.length > 0 && pkg.width > 0 && pkg.height > 0 && pkg.weight > 0)) {
    return {
      text: "La estimación salió incompleta. Dime las medidas aproximadas en cm y el peso.",
    };
  }
  ctx.flow.pending_estimate = pkg;
  const conf = result["confidence"] ? ` (confianza ${String(result["confidence"])})` : "";
  const notes = result["notes"] ? `\n${String(result["notes"])}` : "";
  return {
    text: `Estimo que es esto${conf}:\n${pkg.name}: ${pkg.length}×${pkg.width}×${pkg.height} cm, ~${pkg.weight} kg${pkg.fragile ? ", frágil" : ""}${notes}\n\n¿Lo agrego así a tu carga?`,
    buttons: [
      [
        { text: "Agregar bulto", callback_data: "est:ok" },
        { text: "Descartar", callback_data: "est:no" },
      ],
    ],
  };
}

export async function submitProofPhoto(ctx: BotContext, fileId: string): Promise<string> {
  const reqId = ctx.flow.request_id ?? (await resolveRequestForChat(ctx.chatId));
  if (!reqId) return "Este chat no tiene una solicitud registrada. Envía primero tu solicitud.";
  const s = await fetchPaymentSummary(reqId);
  if (!s) return "No encontré esa solicitud.";
  if (s.status !== "awaiting_payment")
    return `La solicitud está ${STATUS_TEXT[s.status] ?? s.status}; ${s.status === "pending" ? "aún no puedes pagar" : "no espera un comprobante"}.`;
  const image = await fetchTelegramImage(fileId).catch(() => null);
  if (!image)
    return "No pude leer esa imagen. El comprobante debe ser jpg, png o webp de máx. 5 MB.";
  const path = `${reqId}/${crypto.randomUUID()}`;
  const admin = serviceClient();
  const { error: upError } = await admin.storage
    .from("payment-proofs")
    .upload(path, image.bytes, { contentType: image.contentType });
  if (upError) return "No se pudo subir el comprobante. Intenta de nuevo.";
  const { error: proofError } = await admin.rpc("submit_payment_proof", {
    p_request: reqId,
    p_path: path,
  });
  if (proofError) return `No se pudo registrar el comprobante: ${proofError.message}`;
  try {
    await notifyDriverOfProof(reqId);
  } catch (e) {
    console.error("[notify-proof]", e);
  }
  // La verificación simulada tarda ~2 s: sondear confirm_payment unas veces.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: status } = await admin.rpc("confirm_payment", { p_request: reqId });
    if (status === "paid") {
      try {
        await notifyRequesterPaidCore(reqId);
      } catch (e) {
        console.error("[notify-paid]", e);
      }
      return `Comprobante recibido — pago confirmado. Tu página de pago: ${appUrl()}/pagos/${reqId}`;
    }
    if (status === "expired")
      return "El plazo venció antes de confirmar el pago. La solicitud quedó expirada.";
  }
  return `Comprobante recibido: está en verificación. Te aviso cuando se confirme. También puedes verlo en ${appUrl()}/pagos/${reqId}`;
}
