import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Repeat, Share2, ArrowLeft, ArrowRight, Check, Layers, ListOrdered, RotateCcw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cityName, estimateRoute, type VehicleKind } from "@/lib/venezuela";
import { packCargo, type Pkg } from "@/lib/packing";
import { cargoLayers, loadingSteps, visibleCargo } from "@/lib/loading-guide";
import { Truck3DView, BOX_COLORS } from "@/components/Truck3DLazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShareTrip, TripRequests } from "@/components/TripRequests";

export const Route = createFileRoute("/_authenticated/viajes/$id")({
  head: () => ({ meta: [{ title: "Plan de carga paso a paso — CargaRuta" }, { name: "description", content: "Organiza tu carga por capas y sigue el montaje de cada bulto en 3D." }, { property: "og:title", content: "Plan de carga paso a paso — CargaRuta" }, { property: "og:description", content: "Organiza tu carga por capas y sigue el montaje de cada bulto en 3D." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Trip,
});

function Trip() {
  const { id } = Route.useParams();
  const [layer, setLayer] = useState<number | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*, vehicles(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <main className="p-10 text-muted-foreground">Cargando…</main>;
  if (!trip) return <main className="p-10">Viaje no encontrado.</main>;
  const v = trip.vehicles;
  const pkgs = (trip.packages as unknown as Pkg[]) ?? [];
  if (!v) return <main className="p-10">Este viaje no tiene vehículo asignado.</main>;
  const result = packCargo({ length: v.length_cm, width: v.width_cm, height: v.height_cm, maxKg: v.max_kg }, pkgs);
  const route = estimateRoute(trip.origin, trip.destination);
  const keys = pkgs.map((p) => p.id);
  const layers = cargoLayers(result.placed);
  const steps = loadingSteps(result.placed);
  const current = step === null ? undefined : steps[step - 1];
  const complete = step !== null && step > steps.length;
  const visible = visibleCargo(result.placed, layer, step);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">{trip.is_return ? "Viaje de regreso · " : ""}{trip.departure_date} · {v.name}</p>
      <h1 className="mt-1 text-3xl font-bold">{cityName(trip.origin)} → {cityName(trip.destination)}</h1>
      {route && <p className="mt-2 text-sm text-muted-foreground">≈ {route.km} km · {route.hours} h de manejo · {route.via} · ~{route.checkpoints} alcabalas · ~{route.tolls} peajes</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {trip.is_return && <ShareTrip trip={trip} />}
        <Button disabled={steps.length === 0} onClick={() => { setLayer(null); setStep(1); }}><ListOrdered /> {step === null ? "Guiar montaje paso a paso" : "Reiniciar guía"}</Button>
        <Label htmlFor="cargo-layer" className="flex items-center gap-2"><Layers className="h-4 w-4" /> Capas</Label>
        <select id="cargo-layer" className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={layer === null ? "all" : String(layer)} onChange={(e) => setLayer(e.target.value === "all" ? null : Number(e.target.value))}>
          <option value="all">Todas las capas</option>
          {layers.map((z, i) => <option key={z} value={z}>Capa {i + 1} · {z === 0 ? "Piso" : `Base a ${z} cm`}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{visible.length} de {steps.length} bultos visibles</span>
      </div>
      {step !== null && <section aria-label="Guía de montaje" aria-live="polite" className="mt-4 border-y border-border bg-muted/30 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase text-primary">{complete ? "Montaje completado" : `Paso ${step} de ${steps.length}`}</p>
            {current && <>
              <h2 className="mt-1 break-words text-xl font-bold">{current.name} · unidad {current.unit}</h2>
              <p className="mt-2 text-sm">Coloca el bulto a {current.x} cm de la cabina, {current.y} cm desde el lateral y {current.z === 0 ? "sobre el piso" : `con la base a ${current.z} cm de altura`}.</p>
              <p className="mt-1 text-sm text-muted-foreground">{current.l} × {current.w} × {current.h} cm · {current.weight} kg · Capa {layers.indexOf(current.z) + 1}</p>
              {current.fragile && <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" /> Frágil: manipula con cuidado y no coloques carga encima.</p>}
              {layer !== null && layer !== current.z && <Button variant="link" className="h-auto px-0 py-2" onClick={() => setLayer(current.z)}>Mostrar la capa de este bulto</Button>}
            </>}
            {complete && <p className="mt-1 flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-primary" /> {steps.length} bultos montados. Revisa la sujeción antes de salir.</p>}
          </div>
          <Button size="icon" variant="ghost" title="Cerrar guía" aria-label="Cerrar guía" onClick={() => { setStep(null); setLayer(null); }}><X /></Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={step <= 1} onClick={() => setStep(Math.max(1, step - 1))}><ArrowLeft /> Anterior</Button>
          {complete ? <Button variant="outline" onClick={() => { setStep(1); setLayer(null); }}><RotateCcw /> Volver a empezar</Button> : <Button onClick={() => setStep(step + 1)}>{step === steps.length ? <Check /> : <ArrowRight />}{step === steps.length ? "Finalizar montaje" : "Montado · siguiente"}</Button>}
        </div>
      </section>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Truck3DView kind={v.kind as VehicleKind} length={v.length_cm} width={v.width_cm} height={v.height_cm} boxes={visible} colorKeys={keys} {...(current ? { highlightedOrder: current.loadOrder } : {})} className="h-[460px] overflow-hidden rounded-lg border border-border lg:col-span-2" />
        <div className="space-y-4">
          <Stat label="Volumen usado" value={`${result.usedVolumePct}%`} pct={result.usedVolumePct} />
          <Stat label="Peso" value={`${result.usedKg.toLocaleString("es-VE")} / ${v.max_kg.toLocaleString("es-VE")} kg`} pct={result.usedKgPct} />
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-mono text-xs uppercase text-muted-foreground">Espacio libre</p>
            <p className="mt-1 text-2xl font-bold">{result.freeM3} m³ · {result.freeKg.toLocaleString("es-VE")} kg</p>
          </div>
          {result.unplaced.length > 0 && (
            <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> {result.unplaced.length} bulto(s) no entran</p>
              <ul className="mt-2 space-y-1">{result.unplaced.slice(0, 6).map((u, i) => <li key={i}>{u.name} #{u.unit}: {u.reason}</li>)}</ul>
            </div>
          )}
          {!trip.is_return && <><ShareReturn trip={trip} kind={v.kind} freeM3={Math.round((v.length_cm * v.width_cm * v.height_cm) / 1e4) / 100} maxKg={v.max_kg} />
          <Button asChild variant="outline" className="w-full"><Link to="/viajes/nuevo" search={{ from: trip.id, regreso: true }}><Repeat /> Planear la carga del regreso</Link></Button></>}
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold">Orden de carga</h2>
      <p className="text-sm text-muted-foreground">Carga primero lo de arriba (va al fondo, junto a la cabina). Lo que entregas primero queda en la puerta.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left font-mono text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">#</th><th className="p-3">Bulto</th><th className="p-3">Posición (fondo, lado, altura)</th><th className="p-3">Medidas</th><th className="p-3">Notas</th></tr>
          </thead>
          <tbody>
            {visible.map((b) => {
              const p = pkgs.find((x) => x.id === b.pkgId);
              return (
                <tr key={b.loadOrder} className={`border-t border-border ${b.loadOrder === current?.loadOrder ? "bg-primary/10" : ""}`}>
                  <td className="p-3 font-mono">{b.loadOrder}</td>
                  <td className="p-3"><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: BOX_COLORS[keys.indexOf(b.pkgId) % BOX_COLORS.length] }} />{b.name} #{b.unit}</td>
                  <td className="p-3 font-mono">{b.x}, {b.y}, {b.z} cm</td>
                  <td className="p-3 font-mono">{b.l}×{b.w}×{b.h}</td>
                  <td className="p-3 text-muted-foreground">{[b.fragile && "Frágil", p?.deadline && `Antes de ${p.deadline.replace("T", " ")}`, p?.pickup && `Recoger: ${p.pickup}`, p?.recipient && `Entregar: ${p.recipient}`].filter(Boolean).join(" · ")}</td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No hay bultos en esta capa{step !== null ? " hasta este paso" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
      {trip.is_return && <TripRequests tripId={trip.id} packages={pkgs} container={{ length: v.length_cm, width: v.width_cm, height: v.height_cm, maxKg: v.max_kg }} onAccepted={() => { setStep(null); setLayer(null); }} />}
    </main>
  );
}

function Stat({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

type TripRow = { id: string; origin: string; destination: string; departure_date: string };

function ShareReturn({ trip, kind, freeM3, maxKg }: { trip: TripRow; kind: string; freeM3: number; maxKg: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("58");
  const [date, setDate] = useState(trip.departure_date);
  const [notes, setNotes] = useState("");
  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("return_offers").insert({
      trip_id: trip.id, driver_name: name, phone, origin: trip.destination, destination: trip.origin,
      available_date: date, vehicle_kind: kind, free_m3: freeM3, free_kg: maxKg, notes: notes || null,
    });
    if (error) return void toast.error("No se pudo publicar");
    qc.invalidateQueries({ queryKey: ["return_offers"] });
    setOpen(false);
    const url = `${window.location.origin}/retornos`;
    const text = `🚚 Disponible para carga de retorno ${cityName(trip.destination)} → ${cityName(trip.origin)} el ${date}. Espacio: ${freeM3} m³ / ${maxKg} kg. Contacto: ${name} +${phone.replace(/\D/g, "")}. ${url}`;
    toast.success("Publicado en la bolsa de retornos");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="w-full" size="lg"><Share2 /> Compartir: busco carga de regreso</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{cityName(trip.destination)} → {cityName(trip.origin)}</DialogTitle></DialogHeader>
        <form onSubmit={publish} className="space-y-3">
          <div><Label>Tu nombre</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>WhatsApp (con código 58)</Label><Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="584121234567" /></div>
          <div><Label>Disponible desde</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. acepto carga refrigerada, salgo temprano" /></div>
          <p className="text-xs text-muted-foreground">Se publicará con el espacio completo del camión: {freeM3} m³ · {maxKg} kg.</p>
          <Button type="submit" className="w-full">Publicar y compartir por WhatsApp</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
