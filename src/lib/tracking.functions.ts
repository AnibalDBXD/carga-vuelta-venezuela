import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { serviceClient } from "./package-requests.functions";
import { sendMail, sendPush, appUrl, type PushSubscriptionRow } from "./notify";
import { cityName } from "./venezuela";

// Avisos de seguimiento al solicitante por correo + push. Fallan silenciosos
// como notifyRequester: el estado del viaje ya quedó guardado.
async function notifyRequest(
  requestId: string,
  route: string,
  { subject, line }: { subject: string; line: string },
) {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("package_requests")
    .select("sender_name, email")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return;
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("request_id", requestId);
  const url = `${appUrl()}/pagos/${requestId}`;
  const text = `${request.sender_name}: ${line} Viaje ${route}.\n\nEstado de tu carga: ${url}`;
  const html = `<p><strong>${request.sender_name}</strong>: ${line} Viaje <strong>${route}</strong>.</p><p><a href="${url}">Ver el estado de mi carga</a></p>`;
  const results = await Promise.allSettled([
    sendMail({ to: request.email, subject, text, html }),
    ...(subs ?? []).map(async (sub) => {
      const state = await sendPush(sub as PushSubscriptionRow, {
        title: subject,
        body: `${route} — toca para ver el estado`,
        url,
      });
      if (state === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }),
  ]);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notify-tracking]", r.reason);
  });
}

// Al marcar salida del viaje se avisa a todas las cargas pagadas que van abordo.
export const notifyTripDeparture = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ tripId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const admin = serviceClient();
    const { data: trip } = await admin
      .from("trips")
      .select("origin, destination, departed_at")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip?.departed_at) return { notified: 0 };
    const { data: requests } = await admin
      .from("package_requests")
      .select("id")
      .eq("trip_id", data.tripId)
      .eq("status", "paid");
    const route = `${cityName(trip.origin)} → ${cityName(trip.destination)}`;
    await Promise.allSettled(
      (requests ?? []).map((r) =>
        notifyRequest(r.id, route, {
          subject: "El camión ya salió",
          line: `el camión ya salió de ${cityName(trip.origin)}; tu carga va en camino a ${cityName(trip.destination)}.`,
        }),
      ),
    );
    return { notified: requests?.length ?? 0 };
  });
