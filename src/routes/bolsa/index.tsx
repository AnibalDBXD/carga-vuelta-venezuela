import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cityName, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { CityField } from "@/components/CityField";
import { OfferDepartureBar } from "@/components/OfferDepartureBar";
import { offerDeparted } from "@/lib/offer-time";
import { PUBLIC_OFFER_COLUMNS, type PublicOffer } from "@/lib/package-request";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/bolsa/")({
  head: () => ({
    meta: [
      { title: "Bolsa de viajes — CargaRuta" },
      {
        name: "description",
        content:
          "Camiones con espacio libre para llevar tu carga entre ciudades de Venezuela. Envía tu solicitud y el conductor te contactará.",
      },
      { property: "og:title", content: "Bolsa de viajes — CargaRuta" },
      {
        property: "og:description",
        content:
          "Camiones con espacio libre para llevar tu carga. Envía tu solicitud y el conductor te contactará.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Bolsa,
});

function Bolsa() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["return_offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_offers")
        .select(PUBLIC_OFFER_COLUMNS)
        .eq("active", true)
        .gte("available_date", new Date().toISOString().slice(0, 10))
        .order("available_date");
      if (error) throw error;
      return data as PublicOffer[];
    },
  });
  const list = data.filter(
    (o) =>
      (!origin || o.origin === origin) && (!dest || o.destination === dest) && !offerDeparted(o),
  );
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">Espacio disponible</p>
      <h1
        className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
        style={{ viewTransitionName: "page-title" }}
      >
        Bolsa de viajes
      </h1>
      <p className="mt-2 text-muted-foreground">
        Camiones con espacio libre para tu carga. Envía tu solicitud y el conductor te contactará.
      </p>
      <div className="mt-6 flex flex-wrap items-start gap-3">
        <div className="w-56">
          <CityField
            id="bolsa-origin"
            label="Origen"
            value={origin}
            onChange={setOrigin}
            placeholder="Cualquier origen"
            allowEmpty
          />
        </div>
        <div className="w-56">
          <CityField
            id="bolsa-dest"
            label="Destino"
            value={dest}
            onChange={setDest}
            placeholder="Cualquier destino"
            allowEmpty
          />
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {isLoading && (
          <>
            {Array.from({ length: 4 }, (_, i) => (
              <OfferCardSkeleton key={i} />
            ))}
          </>
        )}
        {isError && <p className="text-destructive">No se pudo consultar la bolsa de viajes.</p>}
        {!isLoading && !isError && list.length === 0 && (
          <p className="text-muted-foreground">
            No hay camiones disponibles para esa ruta todavía.
          </p>
        )}
        {list.map((o) => (
          <OfferCard key={o.id} offer={o} />
        ))}
      </div>
    </main>
  );
}

function OfferCardSkeleton() {
  return (
    <article className="rounded-lg border border-border bg-card p-5" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-3 flex gap-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-3 h-2 w-full" />
      <Skeleton className="mt-1 h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-36" />
    </article>
  );
}

function OfferCard({ offer: o }: { offer: PublicOffer }) {
  // La página puede quedar abierta: la tarjeta se oculta sola al llegar la hora.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (offerDeparted(o, new Date(now))) return null;
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ viewTransitionName: `offer-title-${o.id}` }}>
          {cityName(o.origin)} → {cityName(o.destination)}
        </h2>
        <span className="font-mono text-xs text-primary">
          {o.available_date}
          {o.available_time ? ` · ${o.available_time.slice(0, 5)}` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {o.driver_name} · {VEHICLE_PRESETS[o.vehicle_kind as VehicleKind]?.label ?? o.vehicle_kind}
      </p>
      <div
        className="mt-3 flex gap-6 font-mono text-sm"
        style={{ viewTransitionName: `offer-space-${o.id}` }}
      >
        <span>{o.free_m3} m³ libres</span>
        <span>{o.free_kg.toLocaleString("es-VE")} kg libres</span>
      </div>
      <OfferDepartureBar offer={o} />
      {o.notes && <p className="mt-3 text-sm">{o.notes}</p>}
      <Button asChild size="sm" className="mt-4">
        <Link to="/bolsa/$offerId" params={{ offerId: o.id }}>
          <Package /> Solicitar espacio
        </Link>
      </Button>
    </article>
  );
}
