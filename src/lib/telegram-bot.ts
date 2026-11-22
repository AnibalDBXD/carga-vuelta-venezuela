// Dispatcher del bot: traduce updates de Telegram a la sesión del asistente y
// a las herramientas. Solo corre en servidor (webhook /api/telegram o polling).
// Spec: specs/003-telegram.md.

import { assistantConfigured, chatWithTools, RateLimitError, type ChatMessage } from "./assistant";
import {
  describeOffer,
  draftSummary,
  driverLinked,
  ensureDraft,
  estimatePackagePhoto,
  fetchOffer,
  fetchPaymentSummary,
  linkChatToDriver,
  linkChatToRequest,
  loadSession,
  resolveRequestForChat,
  runTool,
  saveSession,
  submitProofPhoto,
  TOOL_DEFS,
  upsertDraftPkg,
  type BotContext,
} from "./assistant-tools";
import {
  answerCallbackQuery,
  sendMessage,
  telegramConfigured,
  type TgCallbackQuery,
  type TgInlineButton,
  type TgMessage,
  type TgUpdate,
} from "./telegram";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (!telegramConfigured()) return;
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    const msg = update.message;
    if (!msg || msg.chat.type !== "private") return;
    await handleMessage(msg);
  } catch (e) {
    console.error("[tg-bot]", e);
    const chatId = update.callback_query?.message?.chat.id ?? update.message?.chat.id;
    if (chatId) {
      await sendMessage(chatId, "Algo falló de mi lado. Intenta de nuevo en un momento.").catch(
        () => undefined,
      );
    }
  }
}

// ---------- Mensajes ----------

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const { flow, history } = await loadSession(chatId);
  const ctx: BotContext = { chatId, flow };

  // Nombre visible en Telegram: referencia para la IA (no es el nombre legal).
  const tgName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim();
  if (tgName) flow.tg_name = tgName;

  // Ubicación compartida: sirve para "¿dónde embalo esto?" y queda guardada.
  if (msg.location) {
    flow.location = { lng: msg.location.longitude, lat: msg.location.latitude };
    const reply = await runTool(ctx, "lugares_para_embalar", {});
    await sendMessage(
      chatId,
      `Estos sitios quedan cerca de tu ubicación:\n\n${reply.split("\n").slice(1).join("\n")}`,
    );
    await saveSession(chatId, flow, history);
    return;
  }

  // Foto: comprobante si la solicitud espera pago; si no, estimación del bulto.
  const photo =
    msg.photo?.at(-1) ?? (isImageDocument(msg) ? { file_id: msg.document!.file_id } : null);
  if (photo) {
    const reqId = flow.request_id ?? (await resolveRequestForChat(chatId));
    const summary = reqId ? await fetchPaymentSummary(reqId).catch(() => null) : null;
    if (summary?.status === "awaiting_payment") {
      flow.request_id = reqId!;
      const text = await submitProofPhoto(ctx, photo.file_id);
      await sendMessage(chatId, text);
    } else {
      const { text, buttons } = await estimatePackagePhoto(ctx, photo.file_id);
      await sendMessage(
        chatId,
        text,
        buttons ? { markup: { inline_keyboard: buttons } } : undefined,
      );
    }
    await saveSession(chatId, flow, history);
    return;
  }

  const text = msg.text?.trim();
  if (!text) return;

  if (text.startsWith("/start")) {
    const reply = await handleStart(ctx, text.slice(6).trim());
    await sendMessage(chatId, reply.text, reply.markup ? { markup: reply.markup } : undefined);
    await saveSession(chatId, flow, history);
    return;
  }
  if (text === "/cancelar") {
    flow.draft = { packages: [] };
    delete flow.pending_estimate;
    delete flow.driver_amount_for;
    await sendMessage(
      chatId,
      "Listo, descarté el borrador. ¿Empezamos de nuevo? Cuéntame qué quieres enviar.",
    );
    await saveSession(chatId, flow, history);
    return;
  }
  if (text === "/estado") {
    const reply = await runTool(ctx, "estado_solicitud", {});
    await sendMessage(chatId, reply);
    await saveSession(chatId, flow, history);
    return;
  }
  if (text === "/ayuda") {
    await sendMessage(chatId, HELP_TEXT);
    await saveSession(chatId, flow, history);
    return;
  }

  // El conductor está respondiendo "¿por cuánto USD?": el mensaje es el monto.
  if (flow.driver_amount_for) {
    const amount = parseAmount(text);
    const reqId = flow.driver_amount_for;
    delete flow.driver_amount_for;
    if (amount === null) {
      flow.driver_amount_for = reqId;
      await sendMessage(
        chatId,
        "No entendí el monto. Escríbelo en dólares, ej.: 15 o 12.50 (o /cancelar para soltar).",
      );
      await saveSession(chatId, flow, history);
      return;
    }
    const reply = await runTool(ctx, "decidir_solicitud", {
      request_id: reqId,
      accept: true,
      amount_usd: amount,
    });
    await sendMessage(chatId, reply);
    await saveSession(chatId, flow, history);
    return;
  }

  // Conversación libre con la IA.
  if (!assistantConfigured()) {
    await sendMessage(chatId, "El asistente no está configurado todavía. Intenta más tarde.");
    return;
  }
  const system = await systemPrompt(ctx);
  const messages: ChatMessage[] = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: "user", content: text },
  ];
  const ask = () =>
    chatWithTools({
      system,
      messages,
      tools: TOOL_DEFS,
      execute: (name, args) => runTool(ctx, name, args),
    });
  let reply: string;
  try {
    reply = await ask();
  } catch (e) {
    if (e instanceof RateLimitError) {
      reply = "Estoy un poco ocupado ahora mismo. Dame un minuto y reintenta.";
    } else {
      // Errores 5xx/red suelen ser transitorios: un solo reintento antes de rendirse.
      try {
        reply = await ask();
      } catch (e2) {
        console.error("[tg-bot ia]", e2);
        reply = "No pude procesar eso. ¿Lo repites de otra forma?";
      }
    }
  }
  history.push({ role: "user", content: text }, { role: "assistant", content: reply });
  await sendMessage(chatId, reply);
  await saveSession(chatId, flow, history);
}

function isImageDocument(msg: TgMessage): boolean {
  const mime = msg.document?.mime_type ?? "";
  return mime.startsWith("image/");
}

function parseAmount(text: string): number | null {
  const n = Number(text.replace(/\$/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// ---------- /start con deep-link ----------

async function handleStart(
  ctx: BotContext,
  payload: string,
): Promise<{ text: string; markup?: { inline_keyboard: TgInlineButton[][] } }> {
  const chatId = ctx.chatId;
  const flow = ctx.flow;

  if (payload.startsWith("drv_")) {
    const result = await linkChatToDriver(chatId, payload.slice(4));
    return {
      text:
        result === "linked"
          ? "Conectado. Cuando llegue una solicitud a uno de tus viajes te escribo aquí con botones para aceptar o rechazar."
          : "Este enlace de conexión venció o ya se usó. Genera otro desde tu panel (botón «Conectar Telegram»).",
    };
  }

  if (payload.startsWith("req_")) {
    const reqId = payload.slice(4);
    if (!UUID_RE.test(reqId)) return { text: "Ese enlace no parece válido." };
    const ok = await linkChatToRequest(chatId, reqId);
    if (!ok) return { text: "No encontré esa solicitud. Revisa el enlace." };
    flow.request_id = reqId;
    const s = await fetchPaymentSummary(reqId).catch(() => null);
    return {
      text: `Listo: este chat quedó vinculado a tu solicitud (${s ? `${s.sender_name}` : reqId}). Te aviso cuando el conductor responda, y cuando te acepten puedes ver los datos de pago y enviarme la foto del comprobante aquí mismo. Escribe /estado cuando quieras revisar.`,
    };
  }

  if (payload.startsWith("offer_")) {
    const offerId = payload.slice(6);
    if (!UUID_RE.test(offerId)) return { text: "Ese enlace no parece válido." };
    const offer = await fetchOffer(offerId).catch(() => null);
    if (!offer) {
      return {
        text: "Ese camión ya no tiene solicitudes abiertas. Puedes ver otros con espacio en la bolsa de CargaRuta.",
      };
    }
    flow.offer_id = offerId;
    flow.draft = { packages: [] };
    delete flow.request_id;
    return {
      text:
        `¡Hola! Soy el asistente de CargaRuta.\n\n` +
        `Este camión tiene espacio libre:\n${describeOffer(offer)}\n\n` +
        `Para pedir ese espacio necesito estos datos:\n` +
        `1) Tu nombre y apellido\n` +
        `2) Teléfono de contacto\n` +
        `3) Correo electrónico\n` +
        `4) Dirección de recogida\n` +
        `5) Dirección de entrega\n` +
        `6) Qué envías: descripción, medidas (largo×ancho×alto en cm), peso y cantidad\n\n` +
        `Pásalos como prefieras: todo en un mensaje, dato por dato, o envíame una foto del objeto y estimo las medidas.`,
    };
  }

  return {
    text: `¡Hola! Soy el asistente de CargaRuta.\n\n${HELP_TEXT}`,
  };
}

const HELP_TEXT = `Puedo ayudarte a pedir espacio en un camión con carga libre:
• Te guío con tu solicitud: contacto, direcciones y bultos.
• Mándame una foto del objeto y estimo sus medidas y peso.
• Si el conductor acepta, te paso los datos del pago móvil y recibo la foto del comprobante.
• Pregúntame dónde embalar tu paquete cerca de ti.
Comandos: /estado (tu solicitud) · /cancelar (borrar borrador) · /ayuda.`;

// ---------- Callbacks (botones inline) ----------

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const msg = cb.message;
  if (!msg || msg.chat.type !== "private" || !cb.data) return;
  const chatId = msg.chat.id;
  const { flow, history } = await loadSession(chatId);
  const ctx: BotContext = { chatId, flow };
  const data = cb.data;

  if (data === "est:ok" || data === "est:no") {
    const est = flow.pending_estimate;
    delete flow.pending_estimate;
    if (data === "est:ok" && est) {
      upsertDraftPkg(ensureDraft(flow), est);
      await answerCallbackQuery(cb.id, "Bulto agregado");
      await sendMessage(
        chatId,
        `Agregué ${est.name} (${est.length}×${est.width}×${est.height} cm, ~${est.weight} kg). ¿Algo más o seguimos con tus datos?`,
      );
    } else {
      await answerCallbackQuery(cb.id, "Descartado");
      await sendMessage(chatId, "Descartado. Puedes mandarme otra foto o decirme las medidas.");
    }
    await saveSession(chatId, flow, history);
    return;
  }

  // Botones del aviso al conductor: a:<request> aceptar, r:<request> rechazar.
  const match = /^([ar]):([0-9a-f-]{36})$/i.exec(data);
  if (match) {
    const [, action, reqId] = match;
    if (!(await driverLinked(chatId))) {
      await answerCallbackQuery(cb.id, "Este chat no está vinculado a un conductor");
      return;
    }
    if (action === "r") {
      const reply = await runTool(ctx, "decidir_solicitud", { request_id: reqId, accept: false });
      await answerCallbackQuery(cb.id, "Rechazada");
      await sendMessage(chatId, reply);
    } else {
      flow.driver_amount_for = reqId!;
      await answerCallbackQuery(cb.id);
      await sendMessage(
        chatId,
        "¿Por cuánto USD cobras esta carga? Escríbeme solo el monto (ej.: 15).",
      );
    }
    await saveSession(chatId, flow, history);
    return;
  }

  await answerCallbackQuery(cb.id);
}

// ---------- Contexto para la IA ----------

async function systemPrompt(ctx: BotContext): Promise<string> {
  const parts: string[] = [
    "Eres el asistente de CargaRuta en Telegram (español venezolano, tono cercano y directo). CargaRuta conecta personas que envían encomiendas con camioneros que tienen espacio libre en su viaje.",
  ];
  if (ctx.flow.offer_id) {
    const offer = await fetchOffer(ctx.flow.offer_id).catch(() => null);
    parts.push(
      offer
        ? `OFERTA ACTIVA en este chat: ${describeOffer(offer)} (id ${ctx.flow.offer_id}). Si la carga del usuario supera ${offer.free_m3} m³ o ${offer.free_kg} kg, adviértele que puede no caber.`
        : "La oferta que traía el usuario ya no admite solicitudes: dilo y sugiere buscar otra en la bolsa de CargaRuta.",
    );
  }
  // Lo ya recolectado: sin esto el modelo no sabe qué falta y repregunta.
  const draft = ctx.flow.draft;
  if (
    draft &&
    (draft.sender ||
      draft.phone ||
      draft.email ||
      draft.pickup ||
      draft.delivery ||
      draft.notes ||
      draft.packages.length)
  ) {
    parts.push(
      `BORRADOR ACTUAL (ya guardado — no lo vuelvas a pedir; solo falta lo que aparece como "—". Si el usuario corrige un dato, guárdalo de nuevo con la herramienta):\n${draftSummary(draft)}`,
    );
  }
  if (ctx.flow.pending_estimate) {
    const e = ctx.flow.pending_estimate;
    parts.push(
      `Hay una estimación por foto PENDIENTE de confirmar: ${e.name} ${e.length}×${e.width}×${e.height} cm, ~${e.weight} kg${e.fragile ? ", frágil" : ""}. Si el usuario la confirma, agrégala con agregar_bulto; si corrige medidas o peso, usa lo corregido.`,
    );
  }
  if (ctx.flow.request_id) {
    parts.push(`Ya envió una solicitud desde este chat: ${ctx.flow.request_id}.`);
  }
  if (ctx.flow.tg_name) {
    parts.push(
      `El usuario aparece en Telegram como "${ctx.flow.tg_name}" (solo referencia para saludar; el nombre de la solicitud es el que él confirme, con apellido).`,
    );
  }
  if (await driverLinked(ctx.chatId)) {
    parts.push(
      "Este chat TAMBIÉN es de un conductor vinculado: puede usar decidir_solicitud para aceptar (con monto USD) o rechazar solicitudes de SUS viajes.",
    );
  }
  parts.push(`FLUJO DEL SOLICITANTE: para pedir espacio se necesita: nombre, teléfono, correo, dirección de recogida, dirección de entrega, y uno o más bultos (descripción, largo×ancho×alto en cm, peso en kg por bulto, cantidad, si es frágil). Guarda cada dato con las herramientas apenas lo dé, sin repreguntar lo ya guardado. Cuando todo esté completo, muestra ver_borrador y pide confirmación explícita antes de enviar_solicitud. Después de enviada queda pendiente del conductor.
- Si el usuario manda foto del objeto, la app ya la procesó o la procesará como estimación; ayúdalo a confirmar medidas.
- Si el usuario repite o corrige un bulto ya guardado, llama agregar_bulto otra vez con el mismo nombre y los datos corregidos: la herramienta lo reemplaza (nunca sumes cantidades ni crees otro bulto igual).
- Las direcciones de recogida y entrega deben estar SOBRE la ruta del viaje de la oferta. guardar_direcciones las valida en el mapa: si una queda fuera de la ruta, explica el motivo y pide una dirección dentro de la ruta; nunca inventes ni asumas una dirección.
- dudas de embalaje → lugares_para_embalar. El usuario también puede mandar su ubicación.
- El pago lo cobra la plataforma por pago móvil en bolívares a tasa BCV (datos_de_pago lo muestra cuando el conductor acepta). El comprobante se envía como foto aquí mismo.
- NUNCA digas "regreso" o "retorno" al solicitante: es solo espacio en camión.`);
  parts.push(
    `REGLAS: respuestas cortas (Telegram), español de Venezuela, sin markdown complejo (negrita simple está bien). JAMÁS inventes nombre, teléfono, correo, direcciones ni medidas — solo guardas con las herramientas lo que el usuario escribió literalmente; si falta algo, pídelo. Si una herramienta reporta un error, explícalo y pide el dato correcto. Ante monto/aceptar como conductor, usa decidir_solicitud.`,
  );
  return parts.join("\n\n");
}
