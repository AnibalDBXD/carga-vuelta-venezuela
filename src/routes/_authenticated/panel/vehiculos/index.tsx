import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { Truck3DView } from "@/components/Truck3DLazy";
import { VehicleThumb } from "@/components/VehicleThumb";
import { VehicleForm, emptyVehicleForm } from "@/components/VehicleForm";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/panel/vehiculos/")({
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
  const navigate = useNavigate();
  const { data: vehicles = [], isLoading } = useQuery(vehiclesQuery);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(emptyVehicleForm("camion750"));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("vehicles")
        .insert({ ...f, name: f.name || VEHICLE_PRESETS[f.kind].label });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehículo guardado");
      setF(emptyVehicleForm(f.kind));
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Flota</p>
          <h1
            className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
            style={{ viewTransitionName: "page-title" }}
          >
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
          <VehicleForm
            f={f}
            setF={setF}
            onSubmit={() => save.mutate()}
            pending={save.isPending}
            submitLabel="Guardar vehículo"
            onCancel={() => setOpen(false)}
          />
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
          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <VehicleCardSkeleton key={i} />
              ))}
            </div>
          ) : vehicles.length === 0 ? (
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
                    onClick={() => navigate({ to: "/panel/vehiculos/$id", params: { id: v.id } })}
                    className="cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-muted-foreground"
                  >
                    <div className="border-b border-border bg-background p-3">
                      <VehicleThumb kind={kind} className="h-24 w-full" />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2
                          className="text-lg font-bold leading-tight"
                          style={{ viewTransitionName: `vehicle-title-${v.id}` }}
                        >
                          {v.name}
                        </h2>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="-mr-1 -mt-1 shrink-0"
                          aria-label={`Eliminar ${v.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            del.mutate(v.id);
                          }}
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

function VehicleCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card" aria-hidden="true">
      <div className="border-b border-border bg-background p-3">
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="-mr-1 -mt-1 h-9 w-9 shrink-0" />
        </div>
        <Skeleton className="mt-2 h-4 w-44" />
        <Skeleton className="mt-3 h-4 w-52 max-w-full" />
      </div>
    </article>
  );
}
