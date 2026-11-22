import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cityName } from "@/lib/venezuela";
import type { Pkg } from "@/lib/packing";
import { Button } from "@/components/ui/button";
import { ShareTrip } from "@/components/TripRequests";

export const Route = createFileRoute("/_authenticated/viajes/")({
  head: () => ({ meta: [{ title: "Mis viajes — CargaRuta" }, { name: "description", content: "Historial de tus viajes de carga." }, { property: "og:title", content: "Mis viajes — CargaRuta" }, { property: "og:description", content: "Historial de tus viajes de carga." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Viajes,
});

function Viajes() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*, vehicles(name)").order("departure_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Mis viajes</h1>
        <Button asChild><Link to="/viajes/nuevo" search={{}}>Nuevo viaje</Link></Button>
      </div>
      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {!isLoading && data.length === 0 && <p className="text-muted-foreground">Todavía no has planificado viajes.</p>}
        {data.map((t) => {
          const pk = (t.packages as unknown as Pkg[]) ?? [];
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
              <Link to="/viajes/$id" params={{ id: t.id }} className="min-w-0 flex-1">
                <p className="text-lg font-bold">{cityName(t.origin)} → {cityName(t.destination)}</p>
                <p className="text-sm text-muted-foreground">{t.departure_date} · {t.vehicles?.name ?? "Sin vehículo"} · {pk.reduce((s, p) => s + p.qty, 0)} bultos</p>
              </Link>
              <Button asChild size="sm" variant="outline"><Link to="/viajes/nuevo" search={{ from: t.id }}><Copy /> Repetir</Link></Button>
              {t.is_return ? <ShareTrip trip={t} /> : <Button asChild size="sm" variant="outline"><Link to="/viajes/nuevo" search={{ from: t.id, regreso: true }}><Repeat /> Planear regreso</Link></Button>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
