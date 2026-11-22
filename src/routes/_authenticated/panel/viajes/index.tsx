import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Copy, Repeat, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cityName } from "@/lib/venezuela";
import { packCargo, type Pkg } from "@/lib/packing";
import { groupTrips } from "@/lib/trip-groups";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareTrip } from "@/components/TripRequests";
import { ConnectTelegram } from "@/components/ConnectTelegram";
import { McpAccess } from "@/components/McpAccess";

export const Route = createFileRoute("/_authenticated/panel/viajes/")({
  head: () => ({
    meta: [
      { title: "Mis viajes — CargaRuta" },
      { name: "description", content: "Historial de tus viajes de carga." },
      { property: "og:title", content: "Mis viajes — CargaRuta" },
      { property: "og:description", content: "Historial de tus viajes de carga." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Viajes,
});

function Viajes() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*, vehicles(*)")
        .order("departure_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  // Completar despublica la oferta de la bolsa; reabrir no la reactiva
  // (el conductor la reabre desde ShareTrip si quiere).
  const toggleCompleted = async (t: { id: string; completed_at: string | null }) => {
    const done = t.completed_at === null;
    const { error } = await supabase
      .from("trips")
      .update({ completed_at: done ? new Date().toISOString() : null })
      .eq("id", t.id);
    if (error) return void toast.error("No se pudo actualizar el viaje");
    if (done) await supabase.from("return_offers").update({ active: false }).eq("trip_id", t.id);
    void qc.invalidateQueries({ queryKey: ["trip", t.id] });
    void qc.invalidateQueries({ queryKey: ["trips"] });
    void qc.invalidateQueries({ queryKey: ["return_offers"] });
    toast.success(done ? "Viaje marcado como completado" : "Viaje reabierto");
  };
  // Bandeja de entrada: solicitudes pendientes por viaje (RLS deja solo las propias).
  const tripIds = data.map((t) => t.id);
  const { data: pendingCounts = {} } = useQuery({
    queryKey: ["pending-requests", tripIds],
    enabled: tripIds.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("package_requests")
        .select("trip_id")
        .eq("status", "pending")
        .in("trip_id", tripIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.trip_id] = (counts[r.trip_id] ?? 0) + 1;
      return counts;
    },
  });
  // Agrupa por camión + día para mostrar cuando está haciendo ida y vuelta.
  const groups = groupTrips(data);

  const renderTrip = (t: (typeof data)[number]) => {
    const pk = (t.packages as unknown as Pkg[]) ?? [];
    const free = t.vehicles
      ? packCargo(
          {
            length: t.vehicles.length_cm,
            width: t.vehicles.width_cm,
            height: t.vehicles.height_cm,
            maxKg: t.vehicles.max_kg,
          },
          pk,
        )
      : null;
    return (
      <div
        key={t.id}
        className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
      >
        <Link to="/panel/viajes/$id" params={{ id: t.id }} className="min-w-0 flex-1">
          <p
            className="flex flex-wrap items-center gap-2 text-lg font-bold"
            style={{ viewTransitionName: `trip-title-${t.id}` }}
          >
            {cityName(t.origin)} → {cityName(t.destination)}
            {t.completed_at !== null && (
              <span className="rounded border border-primary/40 px-2 py-0.5 font-mono text-xs font-normal text-primary">
                Completado
              </span>
            )}
            {(pendingCounts[t.id] ?? 0) > 0 && (
              <span className="rounded border border-primary bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                {pendingCounts[t.id]} {pendingCounts[t.id] === 1 ? "solicitud" : "solicitudes"}
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {t.departure_date} ·{" "}
            {t.departure_time ? `salida ${t.departure_time.slice(0, 5)}` : "sin hora de salida"} ·{" "}
            {t.vehicles?.name ?? "Sin vehículo"} · {pk.reduce((s, p) => s + p.qty, 0)} bultos
          </p>
        </Link>
        <Button size="sm" variant="outline" onClick={() => void toggleCompleted(t)}>
          {t.completed_at === null ? (
            <>
              <CheckCheck /> Completar
            </>
          ) : (
            <>
              <RotateCcw /> Reabrir
            </>
          )}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/panel/viajes/nuevo" search={{ from: t.id }}>
            <Copy /> Repetir
          </Link>
        </Button>
        {t.completed_at === null && (
          <ShareTrip trip={t} vehicle={t.vehicles} freeM3={free?.freeM3} freeKg={free?.freeKg} />
        )}
        {!t.is_return && t.completed_at === null && (
          <Button asChild size="sm" variant="outline">
            <Link to="/panel/viajes/nuevo" search={{ from: t.id, regreso: true }}>
              <Repeat /> Planear regreso
            </Link>
          </Button>
        )}
      </div>
    );
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
          style={{ viewTransitionName: "page-title" }}
        >
          Mis viajes
        </h1>
        <div className="flex items-center gap-2">
          <ConnectTelegram />
          <McpAccess />
          <Button asChild>
            <Link to="/panel/viajes/nuevo" search={{}}>
              Nuevo viaje
            </Link>
          </Button>
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">
        Cada viaje guarda su plan de carga; desde acá puedes repetirlo o planear el regreso.
      </p>
      <div className="mt-8 space-y-3">
        {isLoading && (
          <>
            {Array.from({ length: 3 }, (_, i) => (
              <TripRowSkeleton key={i} />
            ))}
          </>
        )}
        {!isLoading && data.length === 0 && (
          <p className="text-muted-foreground">Todavía no has planificado viajes.</p>
        )}
        {groups.map((g) => {
          const times = g.trips
            .map((t) => t.departure_time?.slice(0, 5))
            .filter((value): value is string => Boolean(value));
          return g.roundTrip ? (
            <section
              key={g.key}
              aria-label="Viaje de ida y vuelta"
              className="rounded-xl border border-primary/30 bg-secondary/20 p-3 sm:p-4"
            >
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pb-3">
                <Repeat className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="font-mono text-xs uppercase tracking-widest text-primary">
                  Ida y vuelta
                </p>
                <p className="text-xs text-muted-foreground">
                  {g.trips[0]?.departure_date} · {g.trips[0]?.vehicles?.name ?? "Sin vehículo"} ·{" "}
                  {times.length > 0 ? `${times.join(" → ")} · ` : "sin hora · "}
                  {g.trips.length} viajes
                </p>
              </header>
              <div className="space-y-3">{g.trips.map(renderTrip)}</div>
            </section>
          ) : (
            g.trips.map(renderTrip)
          );
        })}
      </div>
    </main>
  );
}

function TripRowSkeleton() {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
      aria-hidden="true"
    >
      <div className="min-w-0 flex-1">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-9 w-36" />
    </div>
  );
}
