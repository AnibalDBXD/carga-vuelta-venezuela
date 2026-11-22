import { useEffect, useState } from "react";
import { offerDepartureAt, offerProgress } from "@/lib/offer-time";
import type { PublicOffer } from "@/lib/package-request";

// Barra de progreso del tiempo que le queda al viaje dentro de su ventana
// (publicación → salida estimada): verde llena → roja casi vacía.
export function OfferDepartureBar({ offer }: { offer: PublicOffer }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const p = offerProgress(offer, new Date(now));
  const remaining = Math.max(0, offerDepartureAt(offer).getTime() - now);
  const minutes = Math.round(remaining / 60_000);
  const label =
    minutes >= 120
      ? `Sale en ${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `Sale en ${minutes} min`;

  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div
          className="h-full"
          style={{
            width: `${p * 100}%`,
            backgroundColor: `hsl(${Math.round(120 * p)} 80% 45%)`,
          }}
        />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
