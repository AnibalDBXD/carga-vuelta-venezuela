import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { publicClient } from "./package-requests.functions";
import { getBcvRate } from "./bcv";
import { sendMail, sendPush, appUrl, type PushSubscriptionRow } from "./notify";
import { clientTotalUsd, type PaymentSummary } from "./package-request";
import { cityName } from "./venezuela";

// Service role solo en servidor: lee email/suscripciones y firma URLs de storage.
function serviceClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SECRET_KEY"];
  if (!key || !url) throw new Error("Servicio no disponible");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

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

// Tras aceptar, el cliente llama esto: envía correo + push una sola vez (notified_at).
export const notifyRequester = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const admin = serviceClient();
    const { data: request } = await admin
      .from("package_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", data.requestId)
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
      .eq("request_id", data.requestId);
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
    ]);
    results.forEach((r) => {
      if (r.status === "rejected") console.error("[notify]", r.reason);
    });
    return { notified: true };
  });
