import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  offerRequestSchema,
  PUBLIC_OFFER_COLUMNS,
  type PublicOffer,
  type SharedTrip,
} from "./package-request";
import { offerDeparted } from "./offer-time";
import { cityName } from "./venezuela";
import { sendMail, appUrl } from "./notify";

// Capability-only RPCs expose route details and accept submissions, never private rows.
export function publicClient(url: string | undefined, key: string | undefined) {
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

// Service role solo en servidor: lee datos privados (dueño del viaje, emails) y
// firma URLs de storage. Nunca se llama desde el navegador.
export function serviceClient() {
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

// Avisa por correo al dueño del viaje cuando llega una solicitud: sin esto el
// conductor solo se entera si tiene la página del viaje abierta (polling 30 s).
async function notifyDriverOfRequest(requestId: string) {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("package_requests")
    .select("trip_id, sender_name")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return;
  const { data: trip } = await admin
    .from("trips")
    .select("user_id, origin, destination, departure_date")
    .eq("id", request.trip_id)
    .maybeSingle();
  if (!trip) return;
  const { data: user, error } = await admin.auth.admin.getUserById(trip.user_id);
  const email = user?.user?.email;
  if (error || !email) return;
  const route = `${cityName(trip.origin)} → ${cityName(trip.destination)}`;
  const url = `${appUrl()}/panel/viajes/${request.trip_id}`;
  await sendMail({
    to: email,
    subject: "Nueva solicitud de carga en tu viaje",
    text: `${request.sender_name} quiere enviar una encomienda en tu viaje ${route} (${trip.departure_date}).\n\nRevisa la solicitud y acepta o rechaza: ${url}`,
    html: `<p><strong>${request.sender_name}</strong> quiere enviar una encomienda en tu viaje <strong>${route}</strong> (${trip.departure_date}).</p><p><a href="${url}">Revisar la solicitud</a></p>`,
  });
}

export const getSharedTrip = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: trip, error } = await publicClient(
      process.env["SUPABASE_URL"],
      process.env["SUPABASE_PUBLISHABLE_KEY"],
    ).rpc("shared_trip", { p_token: data.token });
    if (error) throw new Error("No se pudo consultar el viaje");
    return trip as SharedTrip | null;
  });
export const getOffer = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ offerId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: offer, error } = await publicClient(
      process.env["SUPABASE_URL"],
      process.env["SUPABASE_PUBLISHABLE_KEY"],
    )
      .from("return_offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("id", data.offerId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error("No se pudo consultar el viaje");
    if (offer && offerDeparted(offer)) return null;
    return offer as PublicOffer | null;
  });
export const submitOfferRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => offerRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: requestId, error } = await publicClient(
      process.env["SUPABASE_URL"],
      process.env["SUPABASE_PUBLISHABLE_KEY"],
    ).rpc("submit_offer_request", {
      p_offer: data.offerId,
      p_sender: data.sender,
      p_phone: data.phone,
      p_email: data.email,
      p_pickup: data.pickup,
      p_delivery: data.delivery,
      p_package: data.packages,
      p_notes: data.notes,
    });
    if (error || !requestId)
      throw new Error("No se pudo enviar. Revisa los datos o intenta más tarde.");
    // Aviso al conductor: se intenta pero no bloquea ni invalida la solicitud.
    try {
      await notifyDriverOfRequest(String(requestId));
    } catch (e) {
      console.error("[notify-driver]", e);
    }
    return { requestId };
  });
