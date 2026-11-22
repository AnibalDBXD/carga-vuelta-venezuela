import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { reversePlace, searchPlaces, type GeocodeResult } from "@/lib/geocode";
import { MapPickerDialog } from "@/components/MapPickerDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type GeoPoint = { lng: number; lat: number; label: string };

// Geocoding v6 (free tier 100k req/mes, uso temporal: nada se persiste, el campo
// siempre acepta texto libre). Sin token funciona como un input normal.
export function AddressField({
  name,
  label,
  onPoint,
  initialValue,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  onPoint?: ((p: GeoPoint | null) => void) | undefined;
  initialValue?: string | undefined;
}) {
  const token = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;
  const [value, setValue] = useState(initialValue ?? "");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [point, setPoint] = useState<{ lng: number; lat: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

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

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!token || q.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      try {
        const out = await searchPlaces(q, token);
        if (mySeq === seq.current) {
          setSuggestions(out);
          setOpen(out.length > 0);
        }
      } catch {
        // Sin red o sin cobertura: el texto libre sigue sirviendo.
      }
    }, 350);
  };

  const change = (v: string) => {
    setValue(v);
    setPoint(null);
    onPoint?.(null);
    search(v);
  };

  const clear = () => {
    setValue("");
    setPoint(null);
    setSuggestions([]);
    setOpen(false);
    onPoint?.(null);
  };

  const pick = (s: GeocodeResult) => {
    setValue(s.label);
    setPoint({ lng: s.lng, lat: s.lat });
    setOpen(false);
    setSuggestions([]);
    onPoint?.({ lng: s.lng, lat: s.lat, label: s.label });
  };

  const pickFromMap = async (p: { lng: number; lat: number }) => {
    setOpen(false);
    setSuggestions([]);
    setPoint(p);
    const fallback = `Punto en el mapa ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
    setValue(fallback);
    onPoint?.({ ...p, label: fallback });
    if (!token) return;
    const label = await reversePlace(p.lng, p.lat, token);
    if (label) {
      setValue(label);
      onPoint?.({ ...p, label });
    }
  };

  return (
    <div ref={boxRef} className="relative min-w-0">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={name}
          name={name}
          required
          autoComplete="off"
          value={value}
          onChange={(e) => change(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          aria-expanded={open}
          role="combobox"
          {...props}
        />
        {value !== "" && (
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
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                role="option"
                aria-selected={value === s.label}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => pick(s)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {token && (
        <MapPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          initial={point}
          onSelect={(p) => void pickFromMap(p)}
        />
      )}
    </div>
  );
}
