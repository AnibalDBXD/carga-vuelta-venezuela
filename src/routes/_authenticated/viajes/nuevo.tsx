import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CITIES } from "@/lib/venezuela";
import { estimateAsTripRoute, tripRouteQuery } from "@/lib/routes.functions";
import { RouteMapView } from "@/components/RouteMapLazy";
import { CityField } from "@/components/CityField";
import type { Pkg } from "@/lib/packing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vehiclesQuery } from "../vehiculos";

type Search = { from?: string; regreso?: boolean };

export const Route = createFileRoute("/_authenticated/viajes/nuevo")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["from"] === "string" ? { from: s["from"] } : {}),
    ...(s["regreso"] === true || s["regreso"] === "true" ? { regreso: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Nuevo viaje — CargaRuta" },
      { name: "description", content: "Planifica un viaje de carga." },
      { property: "og:title", content: "Nuevo viaje — CargaRuta" },
      { property: "og:description", content: "Planifica un viaje de carga." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NuevoViaje,
});

const newPkg = (): Pkg => ({
  id: crypto.randomUUID(),
  name: "",
  length: 50,
  width: 40,
  height: 40,
  weight: 20,
  qty: 1,
  fragile: false,
  deadline: "",
  recipient: "",
});
const today = () => new Date().toISOString().slice(0, 10);

function NuevoViaje() {
  const { from, regreso } = Route.useSearch();
  const navigate = useNavigate();
  const { data: vehicles = [], isLoading } = useQuery(vehiclesQuery);
  const [origin, setOrigin] = useState("valencia");
  const [destination, setDestination] = useState("caracas");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate(today());
    if (!from) {
      setPkgs([newPkg()]);
      return;
    }
    supabase
      .from("trips")
      .select("*")
      .eq("id", from)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setOrigin(regreso ? data.destination : data.origin);
        setDestination(regreso ? data.origin : data.destination);
        setVehicleId(data.vehicle_id ?? "");
        setTime(data.departure_time?.slice(0, 5) ?? "");
        const prev = (data.packages as unknown as Pkg[]) ?? [];
        setPkgs(regreso ? [] : prev.map((p) => ({ ...p, id: crypto.randomUUID(), deadline: "" })));
      });
  }, [from, regreso]);

  useEffect(() => {
    if (!vehicleId && vehicles[0]) setVehicleId(vehicles[0].id);
  }, [vehicles, vehicleId]);

  const upd = (id: string, patch: Partial<Pkg>) =>
    setPkgs((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const { data: fetched } = useQuery(tripRouteQuery(origin, destination));
  const route = fetched ?? estimateAsTripRoute(origin, destination);
  const fromCity = CITIES.find((c) => c.id === origin);
  const toCity = CITIES.find((c) => c.id === destination);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) return void toast.error("Primero registra un vehículo");
    if (origin === destination) return void toast.error("El origen y destino deben ser distintos");
    setBusy(true);
    const { data, error } = await supabase
      .from("trips")
      .insert({
        origin,
        destination,
        departure_date: date,
        departure_time: time || null,
        vehicle_id: vehicleId,
        is_return: Boolean(regreso),
        parent_trip_id: regreso && from ? from : null,
        packages: pkgs.map((p) => ({ ...p, name: p.name || "Bulto" })) as never,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return void toast.error("No se pudo guardar el viaje");
    navigate({ to: "/viajes/$id", params: { id: data.id } });
  };

  const sel =
    "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  if (!isLoading && vehicles.length === 0)
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold" style={{ viewTransitionName: "page-title" }}>
          Primero registra tu vehículo
        </h1>
        <p className="mt-2 text-muted-foreground">
          Necesitamos las medidas del espacio de carga para acomodar los paquetes.
        </p>
        <Button asChild className="mt-6">
          <Link to="/vehiculos">Registrar vehículo</Link>
        </Button>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1
        className="text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
        style={{ viewTransitionName: "page-title" }}
      >
        {regreso ? "Planear viaje de regreso" : "Nuevo viaje"}
      </h1>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <section className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-4">
          <CityField id="origin" label="Origen" value={origin} onChange={setOrigin} />
          <CityField
            id="destination"
            label="Destino"
            value={destination}
            onChange={setDestination}
          />
          <div>
            <Label>Fecha de salida</Label>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Hora estimada de salida</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label>Vehículo</Label>
            <select
              className={sel}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          {route && (
            <p className="font-mono text-xs text-muted-foreground md:col-span-4">
              ≈ {route.km} km · {route.hours} h · {route.via} · ~{route.checkpoints} alcabalas · ~
              {route.tolls} peajes
              {route.source === "estimate" && " · estimado"}
            </p>
          )}
          {fromCity && toCity && origin !== destination && (
            <RouteMapView
              className="h-64 w-full overflow-hidden rounded-md border border-border md:col-span-4"
              corridors={[
                {
                  from: { lng: fromCity.lng, lat: fromCity.lat, label: fromCity.name },
                  to: { lng: toCity.lng, lat: toCity.lat, label: toCity.name },
                  geometry: route?.geometry ?? null,
                },
              ]}
            />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Paquetes</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPkgs([...pkgs, newPkg()])}
            >
              <Plus /> Agregar
            </Button>
          </div>
          {pkgs.map((p, i) => (
            <div
              key={p.id}
              className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-12"
            >
              <div className="col-span-2 md:col-span-3">
                <Label>Descripción #{i + 1}</Label>
                <Input
                  placeholder="Ej. Sacos de harina"
                  value={p.name}
                  onChange={(e) => upd(p.id, { name: e.target.value })}
                />
              </div>
              <div>
                <Label>Largo</Label>
                <Input
                  type="number"
                  min={1}
                  value={p.length}
                  onChange={(e) => upd(p.id, { length: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Ancho</Label>
                <Input
                  type="number"
                  min={1}
                  value={p.width}
                  onChange={(e) => upd(p.id, { width: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Alto</Label>
                <Input
                  type="number"
                  min={1}
                  value={p.height}
                  onChange={(e) => upd(p.id, { height: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Kg c/u</Label>
                <Input
                  type="number"
                  min={0}
                  value={p.weight}
                  onChange={(e) => upd(p.id, { weight: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Cant.</Label>
                <Input
                  type="number"
                  min={1}
                  value={p.qty}
                  onChange={(e) => upd(p.id, { qty: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <Label>Entregar antes de</Label>
                <Input
                  type="datetime-local"
                  value={p.deadline}
                  onChange={(e) => upd(p.id, { deadline: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={p.fragile}
                  onCheckedChange={(v) => upd(p.id, { fragile: v })}
                  id={`f${p.id}`}
                />
                <Label htmlFor={`f${p.id}`}>Frágil</Label>
              </div>
              <div className="col-span-2 md:col-span-11">
                <Label>Destinatario / dirección</Label>
                <Input
                  value={p.recipient}
                  onChange={(e) => upd(p.id, { recipient: e.target.value })}
                />
              </div>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Quitar"
                  onClick={() => setPkgs(pkgs.filter((x) => x.id !== p.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Medidas en centímetros.</p>
        </section>
        <Button type="submit" size="lg" disabled={busy}>
          {regreso ? "Guardar regreso y recibir paquetes" : "Optimizar carga"}
        </Button>
      </form>
    </main>
  );
}
