import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CITIES, cityName, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/retornos")({
  head: () => ({
    meta: [
      { title: "Bolsa de cargas de retorno — CargaRuta" },
      { name: "description", content: "Camioneros disponibles para llevar tu carga en su viaje de regreso entre ciudades de Venezuela." },
      { property: "og:title", content: "Bolsa de cargas de retorno — CargaRuta" },
      { property: "og:description", content: "Camioneros disponibles para llevar tu carga en su viaje de regreso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Retornos,
});

function Retornos() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["return_offers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("return_offers").select("*").eq("active", true).order("available_date");
      if (error) throw error;
      return data;
    },
  });
  const list = data.filter((o) => (!origin || o.origin === origin) && (!dest || o.destination === dest));
  const sel = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Bolsa de cargas de retorno</h1>
      <p className="mt-2 text-muted-foreground">Camiones con espacio libre en su viaje de regreso. Contacta directo por WhatsApp.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <select className={sel} value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origen">
          <option value="">Cualquier origen</option>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={sel} value={dest} onChange={(e) => setDest(e.target.value)} aria-label="Destino">
          <option value="">Cualquier destino</option>{CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {!isLoading && list.length === 0 && <p className="text-muted-foreground">No hay camiones disponibles para esa ruta todavía.</p>}
        {list.map((o) => (
          <article key={o.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{cityName(o.origin)} → {cityName(o.destination)}</h2>
              <span className="font-mono text-xs text-primary">{o.available_date}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{o.driver_name} · {VEHICLE_PRESETS[o.vehicle_kind as VehicleKind]?.label ?? o.vehicle_kind}</p>
            <div className="mt-3 flex gap-6 font-mono text-sm">
              <span>{o.free_m3} m³ libres</span><span>{o.free_kg.toLocaleString("es-VE")} kg libres</span>
            </div>
            {o.notes && <p className="mt-3 text-sm">{o.notes}</p>}
            <Button asChild size="sm" className="mt-4">
              <a href={`https://wa.me/${o.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${o.driver_name}, vi en CargaRuta tu viaje ${cityName(o.origin)} → ${cityName(o.destination)} del ${o.available_date}. Tengo carga.`)}`} target="_blank" rel="noreferrer">
                <MessageCircle /> Contactar por WhatsApp
              </a>
            </Button>
          </article>
        ))}
      </div>
    </main>
  );
}
