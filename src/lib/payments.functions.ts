import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  publicClient,
  serviceClient,
  telegramChatIdsForRequest,
  telegramChatIdsForUser,
} from "./package-requests.functions";
import { getBcvRate } from "./bcv";
import { sendMail, sendPush, sendTelegram, appUrl, type PushSubscriptionRow } from "./notify";
import { clientTotalUsd, type PaymentSummary } from "./package-request";
import { cityName } from "./venezuela";

export const getExchangeRate = createServerFn({ method: "GET" }).handler(() => getBcvRate());

// Cuenta de pago móvil de la plataforma: la empresa cobra y luego paga al conductor.
function platformPaymentMethod() {
  const bank = process.env["PAGO_MOVIL_BANK"];
  const phone = process.env["PAGO_MOVIL_PHONE"];
  const document = process.env["PAGO_MOVIL_DOCUMENT"];
  const holder = process.env["PAGO_MOVIL_HOLDER"];
  return bank && phone && document && holder ? { bank, phone, document, holder } : null;
}

// Resumen para la página pública de pago: rpc por capability + tasa BCV en Bs.
export const getPaymentSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: summary, error } = await publicClient(
      process.env["SUPABASE_URL"],
      process.env["SUPABASE_PUBLISHABLE_KEY"],
    ).rpc("payment_summary", { p_request: data.requestId });
    if (error) throw new Error("No se pudo consultar el pago");
    if (!summary) return null;
    const raw = summary as unknown as Omit<PaymentSummary, "package"> & { package: unknown };
    // Solicitudes viejas guardan un objeto; las nuevas un arreglo de bultos.
    // total_usd = lo que paga el cliente (amount_usd + 25% de servicio). Filas
    // viejas sin total_usd congelado usan el mismo ×1.25 como fallback.
    const s: PaymentSummary = {
      ...raw,
      package: (Array.isArray(raw.package)
        ? raw.package
        : [raw.package]) as PaymentSummary["package"],
      total_usd: clientTotalUsd(raw.amount_usd, raw.total_usd),
    };
    // El RPC es STABLE (no puede escribir): el vencimiento se refleja solo en la
    // respuesta para que la página no muestre datos de pago tras el plazo.
    if (
      s.status === "awaiting_payment" &&
      s.payment_expires_at !== null &&
      new Date(s.payment_expires_at) < new Date()
    ) {
      return {
        ...s,
        status: "expired",
        payment_method: null,
        amount_bs: null,
        bcv_rate: null,
        bcv_fetched_at: null,
      };
    }
    const payment_method = ["awaiting_payment", "payment_review", "paid"].includes(s.status)
      ? platformPaymentMethod()
      : null;
    if (s.status === "awaiting_payment" && s.total_usd != null) {
      try {
        const { rate, fetchedAt } = await getBcvRate();
        return {
          ...s,
          payment_method,
          amount_bs: Math.round(s.total_usd * rate * 100) / 100,
          bcv_rate: rate,
          bcv_fetched_at: fetchedAt,
        };
      } catch {
        return { ...s, payment_method, amount_bs: null, bcv_rate: null, bcv_fetched_at: null };
      }
    }
    return { ...s, payment_method, amount_bs: null, bcv_rate: null, bcv_fetched_at: null };
  });

// Signed upload URL para el comprobante: solo si la solicitud espera pago y no venció.
export const getProofUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const admin = serviceClient();
    const { data: request } = await admin
      .from("package_requests")
      .select("status, payment_expires_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request || request.status !== "awaiting_payment")
      throw new Error("Esta solicitud no espera pago");
    if (request.payment_expires_at && new Date(request.payment_expires_at) < new Date())
      throw new Error("El plazo para pagar venció");
    const path = `${data.requestId}/${crypto.randomUUID()}`;
    const { data: signed, error } = await admin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error("No se pudo preparar la subida del comprobante");
    return { path: signed.path, token: signed.token };
  });

// Reenvío de enlaces de pago: el cliente escribe su correo en /pagos y le
// llegan sus solicitudes activas. Respuesta genérica (no revela si el correo
// existe) y cooldown por correo para que no sirva de spam relay.
const paymentLinksCooldown = new Map<string, number>();
const PAYMENT_LINKS_COOLDOWN_MS = 10 * 60 * 1000;

const ACTIVE_REQUEST_STATUSES = ["pending", "awaiting_payment", "payment_review"] as const;
const REQUEST_STATUS_LABEL: Record<(typeof ACTIVE_REQUEST_STATUSES)[number], string> = {
  pending: "esperando al conductor",
  awaiting_payment: "por pagar",
  payment_review: "verificando pago",
};

export const requestPaymentLinks = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const now = Date.now();
    const last = paymentLinksCooldown.get(data.email);
    if (last !== undefined && now - last < PAYMENT_LINKS_COOLDOWN_MS) return { sent: true };
    paymentLinksCooldown.set(data.email, now);
    const { data: requests, error } = await serviceClient()
      .from("package_requests")
      .select(
        "id, sender_name, status, amount_usd, total_usd, payment_expires_at, trips(origin, destination, departure_date)",
      )
      .eq("email", data.email)
      .in("status", [...ACTIVE_REQUEST_STATUSES])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !requests?.length) return { sent: true };
    const actionable = requests.filter(
      (r) =>
        r.status !== "awaiting_payment" ||
        !r.payment_expires_at ||
        new Date(r.payment_expires_at) > new Date(),
    );
    if (!actionable.length) return { sent: true };
    const lines = actionable.map((r) => {
      const trip = r.trips as {
        origin: string;
        destination: string;
        departure_date: string;
      } | null;
      const route = trip ? `${cityName(trip.origin)} → ${cityName(trip.destination)}` : "Tu viaje";
      const total = clientTotalUsd(r.amount_usd, r.total_usd);
      const amount = total != null ? ` · $${total.toFixed(2)} USD` : "";
      const status = REQUEST_STATUS_LABEL[r.status as keyof typeof REQUEST_STATUS_LABEL];
      const url = `${appUrl()}/pagos/${r.id}`;
      return `- ${route} (${trip?.departure_date ?? ""}) — ${status}${amount}: ${url}`;
    });
    const text = `${actionable[0]!.sender_name}: estas son tus solicitudes de espacio activas.\n\n${lines.join("\n")}\n\nCada enlace abre tu página de pago con el estado actual.`;
    const html = `<p><strong>${actionable[0]!.sender_name}</strong>: estas son tus solicitudes de espacio activas.</p><ul>${actionable
      .map((r) => {
        const trip = r.trips as {
          origin: string;
          destination: string;
          departure_date: string;
        } | null;
        const route = trip
          ? `${cityName(trip.origin)} → ${cityName(trip.destination)}`
          : "Tu viaje";
        const total = clientTotalUsd(r.amount_usd, r.total_usd);
        const amount = total != null ? ` · $${total.toFixed(2)} USD` : "";
        const status = REQUEST_STATUS_LABEL[r.status as keyof typeof REQUEST_STATUS_LABEL];
        const url = `${appUrl()}/pagos/${r.id}`;
        return `<li>${route} (${trip?.departure_date ?? ""}) — ${status}${amount}: <a href="${url}">ver mi pago</a></li>`;
      })
      .join("")}</ul><p>Cada enlace abre tu página de pago con el estado actual.</p>`;
    try {
      await sendMail({ to: data.email, subject: "Tus enlaces de pago — CargaRuta", text, html });
    } catch (e) {
      console.error("[payment-links]", e);
    }
    return { sent: true };
  });

// Núcleo compartido: correo + push + Telegram al solicitante una sola vez
// (guard notified_at). Lo llaman el server fn (flujo web) y el bot (cuando el
// conductor acepta desde Telegram).
export async function notifyRequesterAccepted(requestId: string): Promise<{ notified: boolean }> {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("package_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "awaiting_payment")
    .is("notified_at", null)
    .select("id, email, sender_name, amount_usd, total_usd, trip_id")
    .maybeSingle();
  if (!request) return { notified: false };
  const { data: trip } = await admin
    .from("trips")
    .select("origin, destination, departure_date")
    .eq("id", request.trip_id)
    .single();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("request_id", requestId);
  const chatIds = await telegramChatIdsForRequest(requestId);
  const route = trip ? `${cityName(trip.origin)} → ${cityName(trip.destination)}` : "tu viaje";
  // El monto avisado es lo que paga el cliente (total_usd), no el neto del conductor.
  const totalUsd = clientTotalUsd(request.amount_usd, request.total_usd);
  const amount = totalUsd
    ? `$${Number(totalUsd).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
    : "";
  const payUrl = `${appUrl()}/pagos/${request.id}`;
  const subject = "Aceptaron tu carga — falta el pago";
  const text = `${request.sender_name}: el conductor aceptó tu carga en el viaje ${route} (${trip?.departure_date ?? ""}) por ${amount} USD.\n\nPaga aquí (datos de pago móvil y QR): ${payUrl}`;
  const html = `<p><strong>${request.sender_name}</strong>: el conductor aceptó tu carga en el viaje <strong>${route}</strong> (${trip?.departure_date ?? ""}) por <strong>${amount} USD</strong>.</p><p><a href="${payUrl}">Pagar ahora con pago móvil</a> — verás los datos del banco y el QR.</p>`;
  const results = await Promise.allSettled([
    sendMail({ to: request.email, subject, text, html }),
    ...(subs ?? []).map(async (sub) => {
      const state = await sendPush(sub as PushSubscriptionRow, {
        title: "Aceptaron tu carga",
        body: `${route} · ${amount} USD — toca para pagar`,
        url: payUrl,
      });
      if (state === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }),
    ...chatIds.map((chatId) =>
      sendTelegram(
        chatId,
        `¡Aceptaron tu carga! El conductor tomó tu encomienda en el viaje ${route} (${trip?.departure_date ?? ""}) por ${amount} USD.\n\nPídeme los datos de pago móvil escribiendo «pagar» y envíame aquí la foto del comprobante. También puedes pagar en ${payUrl}`,
      ),
    ),
  ]);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notify]", r.reason);
  });
  return { notified: true };
}

// Tras aceptar, el cliente llama esto: correo + push + Telegram una sola vez.
export const notifyRequester = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(({ data }) => notifyRequesterAccepted(data.requestId));

// Pago confirmado: aviso una sola vez (guard paid_notified_at) por correo +
// Telegram. Núcleo compartido entre el server fn y el bot.
export async function notifyRequesterPaidCore(requestId: string): Promise<{ notified: boolean }> {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("package_requests")
    .update({ paid_notified_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "paid")
    .is("paid_notified_at", null)
    .select("id, email, sender_name, trip_id")
    .maybeSingle();
  if (!request) return { notified: false };
  const { data: trip } = await admin
    .from("trips")
    .select("origin, destination, departure_date")
    .eq("id", request.trip_id)
    .single();
  const route = trip ? `${cityName(trip.origin)} → ${cityName(trip.destination)}` : "tu viaje";
  const chatIds = await telegramChatIdsForRequest(requestId);
  const results = await Promise.allSettled([
    sendMail({
      to: request.email,
      subject: "Pago confirmado — tu carga ya va en el viaje",
      text: `${request.sender_name}: confirmamos tu pago. Tu carga ya está montada en el viaje ${route} (${trip?.departure_date ?? ""}).`,
      html: `<p><strong>${request.sender_name}</strong>: confirmamos tu pago. Tu carga ya está montada en el viaje <strong>${route}</strong> (${trip?.departure_date ?? ""}).</p>`,
    }),
    ...chatIds.map((chatId) =>
      sendTelegram(
        chatId,
        `Pago confirmado. Tu carga ya quedó montada en el viaje ${route} (${trip?.departure_date ?? ""}). ¡Buen viaje!`,
      ),
    ),
  ]);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notify-paid]", r.reason);
  });
  return { notified: true };
}

export const notifyRequesterPaid = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(({ data }) => notifyRequesterPaidCore(data.requestId));

// El solicitante subió el comprobante: avisar al conductor (correo + Telegram)
// para que sepa que el pago está en verificación. Núcleo compartido entre el
// server fn (web) y el bot (foto por chat).
export async function notifyDriverOfProof(requestId: string): Promise<{ notified: boolean }> {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("package_requests")
    .select("id, sender_name, status, trip_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status !== "payment_review") return { notified: false };
  const { data: trip } = await admin
    .from("trips")
    .select("user_id, origin, destination")
    .eq("id", request.trip_id)
    .maybeSingle();
  if (!trip) return { notified: false };
  const route = `${cityName(trip.origin)} → ${cityName(trip.destination)}`;
  const url = `${appUrl()}/panel/viajes/${request.trip_id}`;
  const jobs: Promise<unknown>[] = [];
  for (const chatId of await telegramChatIdsForUser(trip.user_id)) {
    jobs.push(
      sendTelegram(
        chatId,
        `${request.sender_name} subió el comprobante de pago en tu viaje ${route}. Se está verificando; si confirma, la carga entra sola al plan. Revisa el comprobante: ${url}`,
      ),
    );
  }
  const { data: user, error } = await admin.auth.admin.getUserById(trip.user_id);
  const email = user?.user?.email;
  if (!error && email) {
    jobs.push(
      sendMail({
        to: email,
        subject: "Comprobante recibido — verificando pago",
        text: `${request.sender_name} subió el comprobante de pago en tu viaje ${route}. Revisa el comprobante: ${url}`,
        html: `<p><strong>${request.sender_name}</strong> subió el comprobante de pago en tu viaje <strong>${route}</strong>.</p><p><a href="${url}">Revisar el comprobante</a></p>`,
      }),
    );
  }
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notify-proof]", r.reason);
  });
  return { notified: true };
}

export const notifyDriverProof = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(({ data }) => notifyDriverOfProof(data.requestId));
