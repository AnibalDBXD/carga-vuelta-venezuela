import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { Truck3DView } from "@/components/Truck3DLazy";
import { VehicleThumb } from "@/components/VehicleThumb";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/vehiculos")({
  head: () => ({
    meta: [
      { title: "Mis vehículos — CargaRuta" },
      { name: "description", content: "Registra tu camión, camioneta o auto." },
      { property: "og:title", content: "Mis vehículos — CargaRuta" },
      { property: "og:description", content: "Registra tu camión, camioneta o auto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Vehiculos,
});

const empty = (k: VehicleKind) => ({
  name: "",
  kind: k,
  brand: "",
  model: "",
  plate: "",
  ...pick(k),
});
function pick(k: VehicleKind) {
  const p = VEHICLE_PRESETS[k];
  return { length_cm: p.length_cm, width_cm: p.width_cm, height_cm: p.height_cm, max_kg: p.max_kg };
}

export const vehiclesQuery = {
  queryKey: ["vehicles"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

function Vehiculos() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useQuery(vehiclesQuery);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty("camion350"));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("vehicles")
        .insert({ ...f, name: f.name || VEHICLE_PRESETS[f.kind].label });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehículo guardado");
      setF(empty(f.kind));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: () => toast.error("No se pudo guardar"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
  const num = (k: "length_cm" | "width_cm" | "height_cm" | "max_kg") => ({
    id: k,
    value: f[k],
    type: "number",
    min: 1,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setF({ ...f, [k]: Number(e.target.value) }),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Flota</p>
          <h1 className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]">
            {open ? "Agregar vehículo" : "Mis vehículos"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {open
              ? "Elige el tipo, ponle nombre y ajusta las medidas internas de carga."
              : "Los vehículos que registres acá aparecen al planificar un viaje."}
          </p>
        </div>
        {open ? (
          <Button variant="outline" onClick={() => setOpen(false)}>
            <ArrowLeft /> Volver a mis vehículos
          </Button>
        ) : (
          <Button onClick={() => setOpen(true)}>
            <Plus /> Agregar vehículo
          </Button>
        )}
      </div>

      {open ? (
        <section
          aria-label="Agregar vehículo"
          className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        >
          <form
            className="space-y-4 rounded-lg border border-border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div>
              <Label>Tipo de vehículo</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(VEHICLE_PRESETS) as VehicleKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setF({ ...f, kind: k, ...pick(k) })}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${f.kind === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  >
                    <span className="block font-semibold">{VEHICLE_PRESETS[k].label}</span>
                    <span className="block opacity-70">{VEHICLE_PRESETS[k].example}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="vehicle-name">Nombre</Label>
                <Input
                  id="vehicle-name"
                  placeholder="Ej. El Toronto azul"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="vehicle-brand">Marca</Label>
                <Input
                  id="vehicle-brand"
                  value={f.brand}
                  onChange={(e) => setF({ ...f, brand: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="vehicle-model">Modelo</Label>
                <Input
                  id="vehicle-model"
                  value={f.model}
                  onChange={(e) => setF({ ...f, model: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="vehicle-plate">Placa</Label>
                <Input
                  id="vehicle-plate"
                  value={f.plate}
                  onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-primary">
              Espacio de carga interno
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="length_cm">Largo (cm)</Label>
                <Input {...num("length_cm")} />
              </div>
              <div>
                <Label htmlFor="width_cm">Ancho (cm)</Label>
                <Input {...num("width_cm")} />
              </div>
              <div>
                <Label htmlFor="height_cm">Alto (cm)</Label>
                <Input {...num("height_cm")} />
              </div>
              <div>
                <Label htmlFor="max_kg">Carga máx (kg)</Label>
                <Input {...num("max_kg")} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar vehículo"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
          <Truck3DView
            kind={f.kind}
            length={f.length_cm}
            width={f.width_cm}
            height={f.height_cm}
            className="h-[420px]"
          />
        </section>
      ) : (
        <section className="mt-10" aria-label="Vehículos guardados">
          {vehicles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <Truck className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold">Aún no tienes vehículos</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Registra el primero para calcular el espacio y el peso disponible al planificar cada
                viaje.
              </p>
              <Button className="mt-5" onClick={() => setOpen(true)}>
                <Plus /> Agregar vehículo
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => {
                const kind = v.kind as VehicleKind;
                const preset = VEHICLE_PRESETS[kind];
                const marca = [v.brand, v.model].filter(Boolean).join(" ");
                return (
                  <article
                    key={v.id}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <div className="border-b border-border bg-background p-3">
                      <VehicleThumb kind={kind} className="h-24 w-full" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-bold leading-tight">{v.name}</h2>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="-mr-1 -mt-1 shrink-0"
                          aria-label={`Eliminar ${v.name}`}
                          onClick={() => del.mutate(v.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {preset?.label ?? kind}
                        {marca && ` · ${marca}`}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        {v.plate && (
                          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] tracking-wider">
                            {v.plate}
                          </span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground">
                          {v.length_cm}×{v.width_cm}×{v.height_cm} cm ·{" "}
                          {Number(v.max_kg).toLocaleString("es-VE")} kg
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
