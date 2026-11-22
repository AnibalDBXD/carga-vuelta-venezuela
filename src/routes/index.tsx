import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight, Package, TrendingUp, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBenefits } from "@/components/RoleBenefits";
import { RouteMatch } from "@/components/RouteMatch";
import { Truck3DView } from "@/components/Truck3DLazy";
import { packCargo } from "@/lib/packing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CargaRuta — Optimiza tu carga y no estés nunca vacío" },
      {
        name: "description",
        content:
          "App para camioneros en Venezuela: planifica rutas desde Valencia, acomoda la carga en 3D y consigue carga de retorno.",
      },
      { property: "og:title", content: "CargaRuta — Optimiza tu carga y no estés nunca vacío" },
      {
        property: "og:description",
        content:
          "Planifica rutas desde Valencia, acomoda la carga en 3D y consigue carga de retorno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const demoBoxes = () =>
  packCargo({ length: 1300, width: 245, height: 260, maxKg: 30000 }, [
    {
      id: "a",
      name: "Harina",
      length: 120,
      width: 120,
      height: 150,
      weight: 800,
      qty: 22,
      fragile: false,
      deadline: "",
      recipient: "",
    },
    {
      id: "b",
      name: "Neveras",
      length: 70,
      width: 70,
      height: 170,
      weight: 65,
      qty: 14,
      fragile: false,
      deadline: "",
      recipient: "",
    },
    {
      id: "c",
      name: "Sacos de café",
      length: 80,
      width: 50,
      height: 30,
      weight: 50,
      qty: 120,
      fragile: false,
      deadline: "",
      recipient: "",
    },
    {
      id: "d",
      name: "Televisores",
      length: 125,
      width: 75,
      height: 15,
      weight: 15,
      qty: 20,
      fragile: true,
      deadline: "",
      recipient: "",
    },
    {
      id: "e",
      name: "Tambores",
      length: 60,
      width: 60,
      height: 90,
      weight: 60,
      qty: 18,
      fragile: false,
      deadline: "",
      recipient: "",
    },
    {
      id: "f",
      name: "Repuestos",
      length: 50,
      width: 40,
      height: 40,
      weight: 20,
      qty: 40,
      fragile: false,
      deadline: "",
      recipient: "",
    },
  ]).placed;

// Cifras de ejemplo para la comparación antes/después del landing.
const COMPARE = { outbound: 120, returnLoad: 90 } as const;
const TOTAL_BEFORE = COMPARE.outbound;
const TOTAL_AFTER = COMPARE.outbound + COMPARE.returnLoad;
const UPLIFT = Math.round(((TOTAL_AFTER - TOTAL_BEFORE) / TOTAL_BEFORE) * 100);

function LegTrack({
  label,
  from,
  to,
  amount,
  empty = false,
  highlight = false,
}: {
  label: string;
  from: string;
  to: string;
  amount: number;
  empty?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 sm:w-28">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {from} → {to}
        </p>
      </div>
      <div className="relative h-9 flex-1">
        <span
          aria-hidden="true"
          className={
            empty
              ? "compare-route absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-border"
              : `compare-route absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full ${
                  highlight ? "h-1 bg-primary" : "h-0.5 bg-primary/70"
                }`
          }
        />
        <span className="absolute inset-0 flex items-center justify-center gap-1.5">
          {empty ? (
            <>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-border bg-card text-muted-foreground">
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                vacío
              </span>
            </>
          ) : (
            <>
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${
                  highlight ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
                }`}
              >
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <Package className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </>
          )}
        </span>
      </div>
      <span
        className={`w-20 shrink-0 text-right font-mono text-xs ${
          empty ? "text-muted-foreground" : "font-semibold"
        }`}
      >
        {empty ? "USD 0" : `+ USD ${amount}`}
      </span>
    </div>
  );
}

function CompareReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh * 0.95;
      const end = vh * 0.35;
      const p1 = clamp((start - rect.top) / Math.max(1, start - end));
      const p2 = clamp((p1 - 0.18) / 0.82);
      el.style.setProperty("--p1", p1.toFixed(3));
      el.style.setProperty("--p2", p2.toFixed(3));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="compare-reveal mt-10 grid gap-5 md:grid-cols-2"
      style={{ "--p1": 1, "--p2": 1 } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function Index() {
  const boxes = demoBoxes();
  return (
    <main>
      <section className="grid-asphalt border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Valencia · Caracas · Puerto Cabello
            </p>
            <h1
              className="mt-3 text-4xl font-bold leading-tight md:text-6xl"
              style={{ viewTransitionName: "page-title" }}
            >
              Carga más.
              <br />
              No estés nunca vacío.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Describe tu camión y tus paquetes. CargaRuta acomoda la carga en 3D, traza tu ruta y
              publica el espacio libre de tus viajes de ida y vuelta para que otros te contraten.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/panel/viajes/nuevo">
                  Planificar un viaje <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/bolsa">Buscar espacio</Link>
              </Button>
            </div>
          </div>
          <Truck3DView
            kind="gandola"
            length={1300}
            width={245}
            height={260}
            boxes={boxes}
            colorKeys={["a", "b", "c", "d", "e", "f"]}
            spin
            stagger={0.025}
            doorLabel={false}
            className="h-[380px]"
          />
        </div>
      </section>
      <RouteMatch />
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Antes y después
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
              El mismo viaje, dos veces pagado.
            </h2>
            <p className="mt-3 text-muted-foreground">
              La ruta es la misma y el camión también. Lo que cambia es si el tramo de vuelta lleva
              carga o vuelve solo con el aire de la carretera.
            </p>
          </div>

          <CompareReveal>
            <article
              className="compare-card rounded-xl border border-border bg-card/50 p-5"
              style={{ "--p": "var(--p1)" } as React.CSSProperties}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Antes · sin CargaRuta
                </p>
              </header>
              <div className="mt-5 space-y-3">
                <LegTrack label="Ida" from="Valencia" to="Caracas" amount={COMPARE.outbound} />
                <LegTrack
                  label="Vuelta"
                  from="Caracas"
                  to="Valencia"
                  amount={COMPARE.returnLoad}
                  empty
                />
              </div>
              <footer className="mt-5 border-t border-border pt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Ganancia del recorrido
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold">USD {TOTAL_BEFORE}</p>
                  </div>
                  <p className="max-w-[11rem] text-right text-xs text-muted-foreground">
                    330 km recorridos · 165 km sin carga
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="compare-bar h-full rounded-full bg-muted-foreground"
                    style={
                      {
                        "--bar": `${Math.round((TOTAL_BEFORE / TOTAL_AFTER) * 100)}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </footer>
            </article>

            <article
              className="compare-card rounded-xl border border-primary/40 bg-secondary/20 p-5"
              style={{ "--p": "var(--p2)" } as React.CSSProperties}
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-widest text-primary">
                  Después · con CargaRuta
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />+{UPLIFT}% por viaje
                </span>
              </header>
              <div className="mt-5 space-y-3">
                <LegTrack label="Ida" from="Valencia" to="Caracas" amount={COMPARE.outbound} />
                <LegTrack
                  label="Vuelta"
                  from="Caracas"
                  to="Valencia"
                  amount={COMPARE.returnLoad}
                  highlight
                />
              </div>
              <footer className="mt-5 border-t border-border pt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Ganancia del recorrido
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold text-primary">USD {TOTAL_AFTER}</p>
                  </div>
                  <p className="max-w-[11rem] text-right text-xs text-muted-foreground">
                    330 km recorridos · los dos tramos con carga
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="compare-bar h-full rounded-full bg-primary"
                    style={{ "--bar": "100%" } as React.CSSProperties}
                  />
                </div>
              </footer>
            </article>
          </CompareReveal>

          <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
            Ejemplo con un flete de ida de USD {COMPARE.outbound} y una carga de vuelta de USD{" "}
            {COMPARE.returnLoad}. El porcentaje compara la ganancia del recorrido completo, no la
            tarifa de un tramo.
          </p>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">El modelo</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
              Dos lados, el mismo viaje.
            </h2>
            <p className="mt-3 text-muted-foreground">
              El camión ya tiene que salir y la carga ya tiene que llegar. CargaRuta los pone en la
              misma ruta: el conductor publica el espacio que le sobra, quien necesita mover algo
              envía su solicitud y, cuando el conductor fija el precio, se paga en la plataforma. El
              paquete entra en el viaje cuando el pago se confirma.
            </p>
          </div>
          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            Un viaje de ida y vuelta puede llevar carga en los dos sentidos: se aprovecha el
            recorrido completo, no un solo tramo.
          </p>
        </div>
      </section>
      <RoleBenefits />
    </main>
  );
}

