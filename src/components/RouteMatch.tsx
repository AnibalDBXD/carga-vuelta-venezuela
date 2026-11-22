import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Clock,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FREE_M3 = 8;

type Client = {
  id: string;
  business: string;
  city: string;
  note: string;
  pkg: string;
  weight: string;
  volume: number;
  distance: string;
  icon: typeof Store;
};

const clients: Client[] = [
  {
    id: "01",
    business: "Bodega La Esquina",
    city: "Maracay",
    note: "Recoge en ruta",
    pkg: "12 cajas de harina",
    weight: "480 kg",
    volume: 1.2,
    distance: "a 3 km de la ARC",
    icon: Store,
  },
  {
    id: "02",
    business: "Ferretería El Tornillo",
    city: "La Victoria",
    note: "Recoge en ruta",
    pkg: "20 sacos de pego",
    weight: "100 kg",
    volume: 0.9,
    distance: "sobre la ARC",
    icon: Wrench,
  },
  {
    id: "03",
    business: "Mercería Central",
    city: "Tazón",
    note: "Recoge en ruta",
    pkg: "4 cajas de electrodomésticos",
    weight: "160 kg",
    volume: 1.1,
    distance: "a 6 km de la ruta",
    icon: ShoppingBag,
  },
];

export function RouteMatch() {
  const [selected, setSelected] = useState<string[]>(clients.map((c) => c.id));
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const volume = clients
    .filter((c) => selected.includes(c.id))
    .reduce((total, c) => total + c.volume, 0);
  const percent = Math.round((volume / FREE_M3) * 100);

  return (
    <section className="border-b border-border bg-secondary/15">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Una ruta, varios paquetes
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
            Un camión. Tres clientes.
            <br />
            La misma carretera.
          </h2>
          <p className="mt-4 text-muted-foreground">
            El conductor publica su ruta y el espacio que le sobra. Cada cliente ve si ese camión
            pasa cerca de su carga y solicita el punto de recogida. Todo termina en un solo plan de
            carga, sin desvíos y sin viajes a medias.
          </p>
        </div>

        <div
          ref={ref}
          className={cn("match-reveal mt-10 grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]", {
            "is-visible": visible,
          })}
        >
          {/* Burbuja del camión */}
          <div
            className="match-item lg:sticky lg:top-24 lg:self-start"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <div className="truck-bubble relative rounded-xl border border-primary/35 bg-card p-5 shadow-[0_18px_40px_-30px_var(--primary)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Truck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Camión · ABC123
                    </p>
                    <p className="font-bold leading-tight">Furgón 350</p>
                  </div>
                </div>
                <span className="rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                  Publicado
                </span>
              </div>

              <div className="mt-5 flex items-center gap-2 text-lg font-bold">
                <span>Valencia</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>Caracas</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="rounded border border-border px-1.5 py-0.5">165 km</span>
                <span className="rounded border border-border px-1.5 py-0.5">3 h</span>
                <span className="rounded border border-border px-1.5 py-0.5">ARC</span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Sale
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    Vie 28 nov · 6:00 am
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Espacio libre
                  </dt>
                  <dd className="mt-1 font-bold">{FREE_M3} m³</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-mono uppercase tracking-widest text-muted-foreground">
                    Carga compartida
                  </span>
                  <span key={selected.length} className="match-pop font-bold text-primary">
                    {selected.length} de {clients.length} paquetes
                  </span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-label="Espacio libre ocupado por clientes"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {volume.toLocaleString("es-VE", { maximumFractionDigits: 1 })} m³ comprometidos ·
                  quedan {(FREE_M3 - volume).toLocaleString("es-VE", { maximumFractionDigits: 1 })}{" "}
                  m³
                </p>
              </div>
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Toca un paquete para sumarlo o quitarlo de la ruta
            </p>
          </div>

          {/* Recorrido con burbujas de clientes */}
          <div className="relative">
            <span className="route-line absolute bottom-10 left-4 top-2 w-px" aria-hidden="true" />
            <ol className="space-y-4">
              {clients.map((c, index) => {
                const Icon = c.icon;
                const matched = selected.includes(c.id);
                return (
                  <li
                    key={c.id}
                    className="match-item relative grid grid-cols-[32px_1fr] gap-4"
                    style={{ "--i": index + 1 } as React.CSSProperties}
                  >
                    <div className="relative flex justify-center pt-6">
                      <span
                        className={cn(
                          "relative z-10 h-3 w-3 rounded-full ring-4 transition",
                          matched
                            ? "bg-primary ring-primary/15"
                            : "bg-muted-foreground/50 ring-transparent",
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      aria-pressed={matched}
                      onClick={() => toggle(c.id)}
                      className={cn(
                        "route-bubble group w-full rounded-xl border bg-card p-4 text-left transition duration-200",
                        matched
                          ? "border-primary/30 hover:border-primary/60"
                          : "border-border opacity-55 hover:opacity-85",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold leading-tight">{c.business}</p>
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {c.city} · {c.note}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                            matched
                              ? "border-success/40 text-success"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {matched ? (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          )}
                          {matched ? "Coincide" : "Pausado"}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5">
                        <Package className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate text-sm">{c.pkg}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                        <span>{c.weight}</span>
                        <span>
                          {c.volume.toLocaleString("es-VE", { maximumFractionDigits: 1 })} m³
                        </span>
                        <span className="ml-auto normal-case">{c.distance}</span>
                      </div>
                    </button>
                  </li>
                );
              })}

              <li
                className="match-item relative grid grid-cols-[32px_1fr] gap-4"
                style={{ "--i": clients.length + 1 } as React.CSSProperties}
              >
                <div className="relative flex justify-center pt-2">
                  <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-primary/40 bg-card text-primary">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="pt-2">
                  <p className="text-sm font-bold">Llegada · Caracas</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Los paquetes recogidos en ruta se descargan en el destino. Un solo recorrido
                    para todos.
                  </p>
                  <Link
                    to="/bolsa"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                  >
                    Ver camiones disponibles
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
