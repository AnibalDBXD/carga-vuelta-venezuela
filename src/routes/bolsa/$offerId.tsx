import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Truck } from "lucide-react";
import { getOffer, submitOfferRequest } from "@/lib/package-requests.functions";
import { CITIES, cityName, suggestStops, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { citiesAlongGeometry } from "@/lib/route-geometry";
import { tripRouteQuery } from "@/lib/routes.functions";
import { packCargo, type Pkg } from "@/lib/packing";
import { Truck3DView } from "@/components/Truck3DLazy";
import { RouteMapView } from "@/components/RouteMapLazy";
import { PackageRequestForm } from "@/components/PackageRequestForm";
import type { GeoPoint } from "@/components/AddressField";
import { Button } from "@/components/ui/button";

const offerQuery = (offerId: string) =>
  queryOptions({
    queryKey: ["offer", offerId],
    queryFn: () => getOffer({ data: { offerId } }),
    staleTime: 0,
  });
export const Route = createFileRoute("/bolsa/$offerId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(offerQuery(params.offerId)),
  head: ({ loaderData }) => {
    const route = loaderData
      ? `${cityName(loaderData.origin)} → ${cityName(loaderData.destination)}`
      : "Viaje disponible";
    const title = `Solicitar espacio · ${route} — CargaRuta`;
    const description = `Envía los detalles de tu paquete para el viaje ${route}. El conductor revisará tu solicitud.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">No se pudo abrir este viaje</h1>
      <p className="mt-3 text-muted-foreground">
        Comprueba el enlace o vuelve a intentarlo más tarde.
      </p>
    </main>
  ),
  component: OfferPage,
});
function OfferPage() {
  const { offerId } = Route.useParams();
  const { data: offer } = useSuspenseQuery(offerQuery(offerId));
  const send = useServerFn(submitOfferRequest);
  const [preview, setPreview] = useState<Pkg[]>([]);
  const [pickupPoint, setPickupPoint] = useState<GeoPoint | null>(null);
  const [deliveryPoint, setDeliveryPoint] = useState<GeoPoint | null>(null);
  const { data: route } = useQuery(tripRouteQuery(offer?.origin ?? "", offer?.destination ?? ""));
  if (!offer)
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Viaje no disponible</h1>
        <p className="mt-3 text-muted-foreground">Este viaje ya no recibe solicitudes.</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/bolsa">
            <ArrowLeft /> Volver a la bolsa
          </Link>
        </Button>
      </main>
    );
  const preset = VEHICLE_PRESETS[offer.vehicle_kind as VehicleKind];
  const container = preset
    ? {
        length: preset.length_cm,
        width: preset.width_cm,
        height: preset.height_cm,
        maxKg: preset.max_kg,
      }
    : null;
  const packed = preview.length > 0 && container ? packCargo(container, preview) : null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/bolsa">
          <ArrowLeft /> Bolsa de viajes
        </Link>
      </Button>
      <p className="mt-4 flex items-center gap-2 font-mono text-xs uppercase text-primary">
        <Truck className="h-4 w-4" /> Espacio disponible · {offer.available_date}
        {offer.available_time ? ` · ${offer.available_time.slice(0, 5)}` : ""}
      </p>
      <h1 className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]">
        {cityName(offer.origin)} → {cityName(offer.destination)}
      </h1>
      {(() => {
        const fromCity = CITIES.find((c) => c.id === offer.origin);
        const toCity = CITIES.find((c) => c.id === offer.destination);
        if (!fromCity || !toCity) return null;
        const via = (
          route?.geometry
            ? citiesAlongGeometry(route.geometry, offer.origin, offer.destination)
            : suggestStops(offer.origin, offer.destination)
        ).map((c) => ({ lng: c.lng, lat: c.lat, label: c.name }));
        return (
          <RouteMapView
            className="mt-6 h-64 w-full overflow-hidden rounded-lg border border-border"
            corridors={[
              {
                from: { lng: fromCity.lng, lat: fromCity.lat, label: fromCity.name },
                to: { lng: toCity.lng, lat: toCity.lat, label: toCity.name },
                geometry: route?.geometry ?? null,
                via,
              },
            ]}
            markers={[
              ...(pickupPoint
                ? [{ ...pickupPoint, color: "#4aa3df", label: `Recogida: ${pickupPoint.label}` }]
                : []),
              ...(deliveryPoint
                ? [{ ...deliveryPoint, color: "#5cc88a", label: `Entrega: ${deliveryPoint.label}` }]
                : []),
            ]}
          />
        );
      })()}
      <div className="mt-8 grid gap-10 lg:grid-cols-5">
        <div className="self-start lg:sticky lg:top-20 lg:col-span-2">
          <p className="text-sm text-muted-foreground">
            {offer.driver_name} · {preset?.label ?? offer.vehicle_kind}
          </p>
          <div className="mt-3 flex gap-6 font-mono text-sm">
            <span>{offer.free_m3} m³ libres</span>
            <span>{offer.free_kg.toLocaleString("es-VE")} kg libres</span>
          </div>
          {offer.notes && <p className="mt-3 text-sm">{offer.notes}</p>}
          {container && (
            <>
              <Truck3DView
                kind={offer.vehicle_kind as VehicleKind}
                length={container.length}
                width={container.width}
                height={container.height}
                boxes={packed?.placed ?? []}
                colorKeys={preview.map((p) => p.id)}
                className="mt-6 h-[380px]"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.length > 0
                  ? "Vista previa de tu carga en el espacio disponible."
                  : "Espacio de carga disponible. Completa las medidas de tu paquete para ver cómo entra."}
              </p>
            </>
          )}
          {packed && packed.unplaced.length > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {packed.unplaced.length} bulto(s) no
              caben en el espacio disponible.
            </p>
          )}
        </div>
        <div className="lg:col-span-3">
          <PackageRequestForm
            onPreview={setPreview}
            onPickupPoint={setPickupPoint}
            onDeliveryPoint={setDeliveryPoint}
            onSubmit={(body) => send({ data: { offerId, ...body } }).then((r) => r.requestId)}
          />
        </div>
      </div>
    </main>
  );
}
