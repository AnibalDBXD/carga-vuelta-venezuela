import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { Truck3DView } from "@/components/Truck3DLazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/vehiculos")({
  head: () => ({ meta: [{ title: "Mis vehículos — CargaRuta" }, { name: "description", content: "Registra tu camión, camioneta o auto." }, { property: "og:title", content: "Mis vehículos — CargaRuta" }, { property: "og:description", content: "Registra tu camión, camioneta o auto." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Vehiculos,
});

const empty = (k: VehicleKind) => ({ name: "", kind: k, brand: "", model: "", plate: "", ...pick(k) });
function pick(k: VehicleKind) { const p = VEHICLE_PRESETS[k]; return { length_cm: p.length_cm, width_cm: p.width_cm, height_cm: p.height_cm, max_kg: p.max_kg }; }

export const vehiclesQuery = {
  queryKey: ["vehicles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

function Vehiculos() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useQuery(vehiclesQuery);
  const [f, setF] = useState(empty("camion350"));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").insert({ ...f, name: f.name || VEHICLE_PRESETS[f.kind].label });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vehículo guardado"); setF(empty(f.kind)); qc.invalidateQueries({ queryKey: ["vehicles"] }); },
    onError: () => toast.error("No se pudo guardar"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("vehicles").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
  const num = (k: "length_cm" | "width_cm" | "height_cm" | "max_kg") => ({ value: f[k], type: "number", min: 1, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) }) });
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">Mis vehículos</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form className="space-y-4 rounded-lg border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div>
            <Label>Tipo de vehículo</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(VEHICLE_PRESETS) as VehicleKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setF({ ...f, kind: k, ...pick(k) })}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${f.kind === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground"}`}>
                  <span className="block font-semibold">{VEHICLE_PRESETS[k].label}</span>
                  <span className="block opacity-70">{VEHICLE_PRESETS[k].example}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nombre</Label><Input placeholder="Ej. El Toronto azul" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
            <div className="col-span-2"><Label>Placa</Label><Input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} /></div>
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-primary">Espacio de carga interno</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Label>Largo (cm)</Label><Input {...num("length_cm")} /></div>
            <div><Label>Ancho (cm)</Label><Input {...num("width_cm")} /></div>
            <div><Label>Alto (cm)</Label><Input {...num("height_cm")} /></div>
            <div><Label>Carga máx (kg)</Label><Input {...num("max_kg")} /></div>
          </div>
          <Button type="submit" disabled={save.isPending}>Guardar vehículo</Button>
        </form>
        <Truck3DView kind={f.kind} length={f.length_cm} width={f.width_cm} height={f.height_cm} className="h-[420px] overflow-hidden rounded-lg border border-border" />
      </div>
      <h2 className="mt-10 text-xl font-bold">Guardados</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {vehicles.length === 0 && <p className="text-muted-foreground">Aún no tienes vehículos.</p>}
        {vehicles.map((v) => (
          <div key={v.id} className="flex items-start justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <p className="font-bold">{v.name}</p>
              <p className="text-sm text-muted-foreground">{VEHICLE_PRESETS[v.kind as VehicleKind]?.label} {v.plate && `· ${v.plate}`}</p>
              <p className="mt-1 font-mono text-xs">{v.length_cm}×{v.width_cm}×{v.height_cm} cm · {v.max_kg} kg</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => del.mutate(v.id)}><Trash2 /></Button>
          </div>
        ))}
      </div>
    </main>
  );
}
