import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { getSharedTrip } from "@/lib/package-requests.functions";

// Enlaces viejos (trip_shares): redirigen a la oferta de la bolsa del viaje.
const sharedQuery = (token: string) =>
  queryOptions({
    queryKey: ["shared-trip", token],
    queryFn: () => getSharedTrip({ data: { token } }),
    staleTime: 0,
  });
export const Route = createFileRoute("/recogidas/$token")({
  loader: async ({ context, params }) => {
    const trip = await context.queryClient.ensureQueryData(sharedQuery(params.token));
    const offerId = trip?.offer_id;
    if (!trip || !offerId || !trip.active) throw new Error("Enlace no disponible");
    throw redirect({ to: "/bolsa/$offerId", params: { offerId } });
  },
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Enlace no disponible</h1>
      <p className="mt-3 text-muted-foreground">
        Este viaje ya no recibe solicitudes por este enlace.
      </p>
    </main>
  ),
  component: () => null,
});
