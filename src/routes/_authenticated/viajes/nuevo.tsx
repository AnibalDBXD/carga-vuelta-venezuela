import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
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

type FieldErrors = Record<string, string>;

type SaveError = {
  summary: string;
  detail?: string | undefined;
  field?: string | undefined;
};

const FIELD_BY_COLUMN: Record<string, string> = {
  origin: "origin",
  destination: "destination",
  departure_date: "date",
  departure_time: "time",
  vehicle_id: "vehicle",
};

/** Traduce el error de PostgREST a un mensaje accionable y al campo que lo causó. */
function describeSaveError(error: {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}): SaveError {
  const technical = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
  const missingColumn =
    error.message.match(/column "?([\w.]+)"? does not exist/i)?.[1] ??
    error.message.match(/Could not find the '([^']+)' column/i)?.[1];

  if ((error.code === "42703" || error.code === "PGRST204") && missingColumn) {
    const column = missingColumn.replace(/^trips\./, "");
    return {
      summary: `La base de datos no tiene la columna “${column}”. Falta aplicar una migración.`,
      detail: `Ejecuta “supabase migration up” y vuelve a intentar. Detalle: ${technical}`,
      field: FIELD_BY_COLUMN[column],
    };
  }
  if (error.code === "23503") {
    return {
      summary: "El vehículo seleccionado ya no existe. Elige otro vehículo.",
      detail: technical,
      field: "vehicle",
    };
  }
  if (error.code === "23502") {
    const column = error.message.match(/column "([^"]+)"/)?.[1]?.replace(/^trips\./, "");
    return {
      summary: column
        ? `Falta completar el campo obligatorio “${column}” del viaje.`
        : "Falta un campo obligatorio del viaje.",
      detail: technical,
      field: column ? FIELD_BY_COLUMN[column] : undefined,
    };
  }
  if (error.code === "42501") {
    return {
      summary: "Tu sesión expiró o no tienes permiso para guardar este viaje.",
      detail: `Vuelve a iniciar sesión e intenta de nuevo. ${technical}`,
    };
  }
  if (error.code === "23514") {
    return {
      summary: "La base de datos rechazó los datos por una regla de validación.",
      detail: technical,
    };
  }
  return {
    summary: "No se pudo guardar el viaje.",
    detail: technical,
  };
}

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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

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
        // No pisa paquetes que el usuario ya haya agregado mientras cargaba el viaje base.
        setPkgs((current) =>
          current.length > 0
            ? current
            : regreso
              ? []
              : prev.map((p) => ({ ...p, id: crypto.randomUUID(), deadline: "" })),
        );
      });
  }, [from, regreso]);

  useEffect(() => {
    if (!vehicleId && vehicles[0]) {
      setVehicleId(vehicles[0].id);
      setErrors((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== "vehicle")),
      );
    }
  }, [vehicles, vehicleId]);

  const upd = (id: string, patch: Partial<Pkg>) => {
    setPkgs((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setErrors((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => !key.startsWith(`pkg-${id}-`)),
      ),
    );
  };

  const clearError = (...keys: string[]) =>
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.includes(key))),
    );

  const fieldProps = (id: string) => ({
    id,
    "aria-invalid": errors[id] ? (true as const) : undefined,
    "aria-describedby": errors[id] ? `${id}-error` : undefined,
    className: errors[id] ? "border-destructive focus-visible:ring-destructive" : undefined,
  });

  const fieldError = (id: string) =>
    errors[id] ? (
      <p id={`${id}-error`} className="mt-1 text-xs leading-snug text-destructive">
        {errors[id]}
      </p>
    ) : null;

  useEffect(() => {
    if (saveError) alertRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [saveError]);

  const { data: fetched } = useQuery(tripRouteQuery(origin, destination));
  const route = fetched ?? estimateAsTripRoute(origin, destination);
  const fromCity = CITIES.find((c) => c.id === origin);
  const toCity = CITIES.find((c) => c.id === destination);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const next: FieldErrors = {};
    if (!origin) next["origin"] = "Selecciona la ciudad de origen.";
    if (!destination) next["destination"] = "Selecciona la ciudad de destino.";
    if (origin && destination && origin === destination)
      next["destination"] = "El destino debe ser distinto del origen.";
    if (!date) next["date"] = "Indica la fecha de salida.";
    if (!vehicleId) next["vehicle"] = "Selecciona el vehículo con el que harás el viaje.";

    pkgs.forEach((p, index) => {
      const n = index + 1;
      if (!(p.length > 0)) next[`pkg-${p.id}-length`] = `El largo del paquete #${n} debe ser mayor que 0.`;
      if (!(p.width > 0)) next[`pkg-${p.id}-width`] = `El ancho del paquete #${n} debe ser mayor que 0.`;
      if (!(p.height > 0)) next[`pkg-${p.id}-height`] = `El alto del paquete #${n} debe ser mayor que 0.`;
      if (!(p.weight >= 0)) next[`pkg-${p.id}-weight`] = `El peso del paquete #${n} no puede ser negativo.`;
      if (!(p.qty >= 1)) next[`pkg-${p.id}-qty`] = `La cantidad del paquete #${n} debe ser al menos 1.`;
    });

    setErrors(next);
    const firstKey = Object.keys(next)[0];
    if (firstKey) {
      const count = Object.keys(next).length;
      setSaveError({
        summary:
          count === 1
            ? "Revisa el campo marcado en rojo."
            : `Revisa los ${count} campos marcados en rojo.`,
        detail: "Corrige los datos señalados y vuelve a guardar el viaje.",
      });
      toast.error("Revisa los campos marcados en rojo");
      window.requestAnimationFrame(() => document.getElementById(firstKey)?.focus());
      return;
    }

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

    if (error || !data) {
      const explained = error
        ? describeSaveError(error)
        : { summary: "La base de datos no devolvió el viaje guardado.", detail: "Intenta de nuevo." };
      setSaveError(explained);
      if (explained.field) setErrors({ [explained.field]: explained.summary });
      if (explained.field)
        window.requestAnimationFrame(() => document.getElementById(explained.field!)?.focus());
      toast.error(explained.summary);
      return;
    }
    navigate({ to: "/viajes/$id", params: { id: data.id } });
  };

  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  if (!isLoading && vehicles.length === 0)
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero registra tu vehículo</h1>
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
      <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.02em]">{regreso ? "Planear viaje de regreso" : "Nuevo viaje"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
        {saveError && (
          <div
            ref={alertRef}
            role="alert"
            aria-live="assertive"
            className="flex gap-3 rounded-lg border border-destructive/60 bg-destructive/10 p-4"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">{saveError.summary}</p>
              {saveError.detail && (
                <p className="mt-1 break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {saveError.detail}
                </p>
              )}
            </div>
          </div>
        )}
        <section className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-4">
          <CityField
            id="origin"
            label="Origen"
            value={origin}
            onChange={(v) => {
              setOrigin(v);
              clearError("origin", "destination");
            }}
            invalid={Boolean(errors["origin"])}
            error={errors["origin"]}
          />
          <CityField
            id="destination"
            label="Destino"
            value={destination}
            onChange={(v) => {
              setDestination(v);
              clearError("origin", "destination");
            }}
            invalid={Boolean(errors["destination"])}
            error={errors["destination"]}
          />
          <div>
            <Label htmlFor="date">Fecha de salida</Label>
            <Input
              {...fieldProps("date")}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearError("date");
              }}
            />
            {fieldError("date")}
          </div>
          <div>
            <Label htmlFor="time">Hora estimada de salida</Label>
            <Input
              {...fieldProps("time")}
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                clearError("time");
              }}
            />
            {fieldError("time")}
          </div>
          <div>
            <Label htmlFor="vehicle">Vehículo</Label>
            <select
              {...fieldProps("vehicle")}
              className={cn(sel, errors["vehicle"] && "border-destructive focus-visible:ring-destructive")}
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                clearError("vehicle");
              }}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {fieldError("vehicle")}
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
              className={cn(
                "grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-12",
                Object.keys(errors).some((k) => k.startsWith(`pkg-${p.id}-`)) &&
                  "border-destructive/60",
              )}
            >
              <div className="col-span-2 md:col-span-3">
                <Label htmlFor={`pkg-${p.id}-name`}>Descripción #{i + 1}</Label>
                <Input
                  id={`pkg-${p.id}-name`}
                  placeholder="Ej. Sacos de harina"
                  value={p.name}
                  onChange={(e) => upd(p.id, { name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`pkg-${p.id}-length`}>Largo</Label>
                <Input
                  {...fieldProps(`pkg-${p.id}-length`)}
                  type="number"
                  min={1}
                  value={p.length}
                  onChange={(e) => upd(p.id, { length: Number(e.target.value) })}
                />
                {fieldError(`pkg-${p.id}-length`)}
              </div>
              <div>
                <Label htmlFor={`pkg-${p.id}-width`}>Ancho</Label>
                <Input
                  {...fieldProps(`pkg-${p.id}-width`)}
                  type="number"
                  min={1}
                  value={p.width}
                  onChange={(e) => upd(p.id, { width: Number(e.target.value) })}
                />
                {fieldError(`pkg-${p.id}-width`)}
              </div>
              <div>
                <Label htmlFor={`pkg-${p.id}-height`}>Alto</Label>
                <Input
                  {...fieldProps(`pkg-${p.id}-height`)}
                  type="number"
                  min={1}
                  value={p.height}
                  onChange={(e) => upd(p.id, { height: Number(e.target.value) })}
                />
                {fieldError(`pkg-${p.id}-height`)}
              </div>
              <div>
                <Label htmlFor={`pkg-${p.id}-weight`}>Kg c/u</Label>
                <Input
                  {...fieldProps(`pkg-${p.id}-weight`)}
                  type="number"
                  min={0}
                  value={p.weight}
                  onChange={(e) => upd(p.id, { weight: Number(e.target.value) })}
                />
                {fieldError(`pkg-${p.id}-weight`)}
              </div>
              <div>
                <Label htmlFor={`pkg-${p.id}-qty`}>Cant.</Label>
                <Input
                  {...fieldProps(`pkg-${p.id}-qty`)}
                  type="number"
                  min={1}
                  value={p.qty}
                  onChange={(e) => upd(p.id, { qty: Number(e.target.value) })}
                />
                {fieldError(`pkg-${p.id}-qty`)}
              </div>
              <div className="col-span-2 md:col-span-2">
                <Label htmlFor={`pkg-${p.id}-deadline`}>Entregar antes de</Label>
                <Input
                  id={`pkg-${p.id}-deadline`}
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
