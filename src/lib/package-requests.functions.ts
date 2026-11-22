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
    return { requestId };
  });
