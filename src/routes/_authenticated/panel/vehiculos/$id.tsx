import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { Truck3DView } from "@/components/Truck3DLazy";
import { VehicleForm, emptyVehicleForm, vehicleToForm } from "@/components/VehicleForm";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/panel/vehiculos/$id")({
  head: () => ({
    meta: [
      { title: "Detalle del vehículo — CargaRuta" },
      { name: "description", content: "Medidas internas y capacidad de carga de tu vehículo." },
      { property: "og:title", content: "Detalle del vehículo — CargaRuta" },
      {
        property: "og:description",
        content: "Medidas internas y capacidad de carga de tu vehículo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Vehiculo,
});

function Vehiculo() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(emptyVehicleForm("camion350"));

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("vehicles")
        .update({ ...f, name: f.name || VEHICLE_PRESETS[f.kind].label })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehículo actualizado");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["vehicle", id] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    },
    onError: () => toast.error("No se pudo guardar"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      navigate({ to: "/panel/vehiculos" });
    },
    onError: () => toast.error("No se pudo eliminar"),
  });

  if (isLoading) return <main className="p-10 text-muted-foreground">Cargando…</main>;
  if (!vehicle) return <main className="p-10">Vehículo no encontrado.</main>;

  const kind = vehicle.kind as VehicleKind;
  const preset = VEHICLE_PRESETS[kind];
  const marca = [vehicle.brand, vehicle.model].filter(Boolean).join(" ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Flota</p>
          <h1
            className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
            style={{ viewTransitionName: `vehicle-title-${id}` }}
          >
            {vehicle.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {preset?.label ?? kind}
            {marca && ` · ${marca}`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/panel/vehiculos">
            <ArrowLeft /> Volver a mis vehículos
          </Link>
        </Button>
      </div>

      {editing ? (
        <section
          aria-label="Editar vehículo"
          className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        >
          <VehicleForm
            f={f}
            setF={setF}
            onSubmit={() => update.mutate()}
            pending={update.isPending}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(false)}
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
        <section
          aria-label="Detalle del vehículo"
          className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
        >
          <div className="rounded-lg border border-border bg-card p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="text-right">
                  {preset?.label ?? kind}
                  {preset && (
                    <span className="block text-xs text-muted-foreground">{preset.example}</span>
                  )}
                </dd>
              </div>
              {marca && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Marca / modelo</dt>
                  <dd className="text-right">{marca}</dd>
                </div>
              )}
              {vehicle.plate && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Placa</dt>
                  <dd>
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] tracking-wider">
                      {vehicle.plate}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-5 font-mono text-xs uppercase tracking-wider text-primary">
              Espacio de carga interno
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Largo</dt>
                <dd className="font-mono">{vehicle.length_cm} cm</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ancho</dt>
                <dd className="font-mono">{vehicle.width_cm} cm</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Alto</dt>
                <dd className="font-mono">{vehicle.height_cm} cm</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Carga máx</dt>
                <dd className="font-mono">{Number(vehicle.max_kg).toLocaleString("es-VE")} kg</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setF(vehicleToForm(vehicle));
                  setEditing(true);
                }}
              >
                <Pencil /> Editar
              </Button>
              <Button variant="destructive" disabled={del.isPending} onClick={() => del.mutate()}>
                <Trash2 /> {del.isPending ? "Eliminando…" : "Eliminar"}
              </Button>
            </div>
          </div>
          <Truck3DView
            kind={kind}
            length={vehicle.length_cm}
            width={vehicle.width_cm}
            height={vehicle.height_cm}
            className="h-[420px]"
          />
        </section>
      )}
    </main>
  );
}
