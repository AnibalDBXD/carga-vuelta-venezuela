import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { CITIES, cityName, nearestCity, type City } from "@/lib/venezuela";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";
import { MapPickerDialog } from "@/components/MapPickerDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Option =
  { kind: "city"; city: City } | { kind: "place"; place: GeocodeResult; near: City | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Autocomplete de origen/destino: primero las ciudades troncales (sin costo),
 * luego lugares de Mapbox ajustados a la ciudad más cercana. El icono de pin
 * permite marcar el punto exacto en el mapa. Sin token solo filtra CITIES.
 */
export function CityField({
  id,
  label,
  value,
  onChange,
  placeholder = "Ciudad o lugar",
  allowEmpty = false,
}: {
  id: string;
  label: string;
  /** id de ciudad ("" = sin selección, solo con allowEmpty). */
  value: string;
  onChange: (cityId: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const token = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;
  const [text, setText] = useState(() => (value ? cityName(value) : ""));
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Último punto elegido: el picker abre centrado ahí, no en toda Venezuela.
  const [pickedPoint, setPickedPoint] = useState<{ lng: number; lat: number } | null>(
    () => CITIES.find((c) => c.id === value) ?? null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Sincroniza el texto cuando el id cambia desde afuera (ej. "viaje de regreso").
  useEffect(() => {
    setText(value ? cityName(value) : "");
    setPickedPoint(CITIES.find((c) => c.id === value) ?? null);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const cityMatches = (q: string): Option[] => {
    const n = norm(q.trim());
    if (!n) return [];
    return CITIES.filter((c) => norm(c.name).includes(n) || norm(c.state).includes(n)).map(
      (city) => ({ kind: "city" as const, city }),
    );
  };

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    const local = cityMatches(q);
    if (!token || q.trim().length < 3) {
      setOptions(local);
      setOpen(local.length > 0);
      return;
    }
    setOptions(local);
    timer.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      try {
        const places = await searchPlaces(q, token);
        if (mySeq !== seq.current) return;
        const remote: Option[] = places.map((place) => ({
          kind: "place" as const,
          place,
          near: nearestCity(place.lng, place.lat),
        }));
        setOptions([...local, ...remote]);
        setOpen(local.length + remote.length > 0);
      } catch {
        // Sin red: quedan las ciudades locales.
      }
    }, 350);
  };

  const change = (v: string) => {
    setText(v);
    if (v === "" && allowEmpty) onChange("");
    search(v);
  };

  const choose = (cityId: string, label: string, point?: { lng: number; lat: number }) => {
    setText(label);
    setPickedPoint(point ?? CITIES.find((c) => c.id === cityId) ?? null);
    setOpen(false);
    setOptions([]);
    onChange(cityId);
  };

  const pickFromMap = (p: { lng: number; lat: number }) => {
    const c = nearestCity(p.lng, p.lat);
    if (c) choose(c.id, c.name, p);
  };

  const clear = () => {
    setText("");
    setOptions([]);
    setPickedPoint(null);
    onChange("");
  };

  return (
    <div ref={boxRef} className="relative min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          onFocus={() => {
            if (options.length === 0 && text.trim() === "") {
              const all = CITIES.map((city) => ({ kind: "city" as const, city }));
              setOptions(all);
              setOpen(true);
            } else if (options.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          aria-expanded={open}
          role="combobox"
        />
        {allowEmpty && text !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar selección"
            onClick={clear}
          >
            <X />
          </Button>
        )}
        {token && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Escoger en el mapa"
            title="Escoger el punto exacto en el mapa"
            onClick={() => setPickerOpen(true)}
          >
            <MapPin />
          </Button>
        )}
      </div>
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          {options.map((o) =>
            o.kind === "city" ? (
              <li key={`c-${o.city.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.city.id}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => choose(o.city.id, o.city.name)}
                >
                  {o.city.name} <span className="text-muted-foreground">· {o.city.state}</span>
                </button>
              </li>
            ) : (
              <li key={`p-${o.place.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    o.near && choose(o.near.id, o.near.name, { lng: o.place.lng, lat: o.place.lat })
                  }
                >
                  {o.place.label}
                  {o.near && (
                    <span className="block font-mono text-xs text-muted-foreground">
                      → ciudad más cercana: {o.near.name}
                    </span>
                  )}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {token && (
        <MapPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Toca el punto: se usará la ciudad más cercana"
          initial={pickedPoint}
          onSelect={pickFromMap}
        />
      )}
    </div>
  );
}
