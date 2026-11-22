import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RouteMapView } from "./RouteMapLazy";

export type PickedPoint = { lng: number; lat: number };

export function MapPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initial,
  title = "Escoge el punto en el mapa",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (p: PickedPoint) => void;
  /** Punto ya elegido (ej. por autocompletado): el mapa abre con el pin ahí. */
  initial?: PickedPoint | null | undefined;
  title?: string;
}) {
  const [picked, setPicked] = useState<PickedPoint | null>(initial ?? null);
  // Al abrir, el pin arranca en la ubicación ya seleccionada (si la hay).
  useEffect(() => {
    if (open) setPicked(initial ?? null);
  }, [open, initial]);
  const close = (v: boolean) => {
    onOpenChange(v);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <RouteMapView
          className="h-80 w-full overflow-hidden rounded-md border border-border"
          corridors={[]}
          markers={picked ? [{ ...picked, color: "#ecc813" }] : []}
          onPick={setPicked}
        />
        <p className="text-xs text-muted-foreground">
          Toca el mapa para marcar el punto exacto
          {picked ? `: ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}` : ""}.
        </p>
        <Button
          disabled={!picked}
          onClick={() => {
            if (!picked) return;
            onSelect(picked);
            close(false);
          }}
        >
          <MapPin /> Usar este punto
        </Button>
      </DialogContent>
    </Dialog>
  );
}
