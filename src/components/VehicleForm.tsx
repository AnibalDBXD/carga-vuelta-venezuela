import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type VehicleFormState = {
  name: string;
  kind: VehicleKind;
  brand: string;
  model: string;
  plate: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  max_kg: number;
};

export function pick(k: VehicleKind) {
  const p = VEHICLE_PRESETS[k];
  return { length_cm: p.length_cm, width_cm: p.width_cm, height_cm: p.height_cm, max_kg: p.max_kg };
}

export const emptyVehicleForm = (k: VehicleKind): VehicleFormState => ({
  name: "",
  kind: k,
  brand: "",
  model: "",
  plate: "",
  ...pick(k),
});

export const vehicleToForm = (v: Tables<"vehicles">): VehicleFormState => ({
  name: v.name,
  kind: v.kind as VehicleKind,
  brand: v.brand ?? "",
  model: v.model ?? "",
  plate: v.plate ?? "",
  length_cm: v.length_cm,
  width_cm: v.width_cm,
  height_cm: v.height_cm,
  max_kg: v.max_kg,
});

export function VehicleForm({
  f,
  setF,
  onSubmit,
  pending,
  submitLabel,
  onCancel,
}: {
  f: VehicleFormState;
  setF: (f: VehicleFormState) => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const num = (k: "length_cm" | "width_cm" | "height_cm" | "max_kg") => ({
    id: k,
    value: f[k],
    type: "number",
    min: 1,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setF({ ...f, [k]: Number(e.target.value) }),
  });

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
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
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
