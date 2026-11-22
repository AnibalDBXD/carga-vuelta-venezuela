import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Repeat, Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Truck3DView } from "@/components/Truck3DLazy";
import { packCargo } from "@/lib/packing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CargaRuta — Optimiza tu carga y no regreses vacío" },
      { name: "description", content: "App para camioneros en Venezuela: planifica rutas desde Valencia, acomoda la carga en 3D y consigue carga de retorno." },
      { property: "og:title", content: "CargaRuta — Optimiza tu carga y no regreses vacío" },
      { property: "og:description", content: "Planifica rutas desde Valencia, acomoda la carga en 3D y consigue carga de retorno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const demoBoxes = () =>
  packCargo({ length: 420, width: 200, height: 200, maxKg: 3500 }, [
    { id: "a", name: "Harina", length: 100, width: 120, height: 90, weight: 400, qty: 4, fragile: false, deadline: "", recipient: "" },
    { id: "b", name: "Electrodomésticos", length: 60, width: 60, height: 80, weight: 40, qty: 6, fragile: true, deadline: "", recipient: "" },
    { id: "c", name: "Repuestos", length: 50, width: 40, height: 40, weight: 20, qty: 10, fragile: false, deadline: "", recipient: "" },
  ]).placed;

function Index() {
  const boxes = demoBoxes();
  return (
    <main>
      <section className="grid-asphalt border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Valencia · Caracas · Puerto Cabello</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight md:text-6xl">Carga más.<br />No regreses vacío.</h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">Describe tu camión y tus paquetes. CargaRuta acomoda la carga en 3D, estima la ruta por la ARC y publica tu viaje de regreso para que otros te contraten.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/viajes/nuevo">Planificar un viaje <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/bolsa">Buscar camión</Link></Button>
            </div>
          </div>
          <Truck3DView kind="camion350" length={420} width={200} height={200} boxes={boxes} colorKeys={["a", "b", "c"]} className="h-[380px] overflow-hidden rounded-lg border border-border" />
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
        {[
          { icon: Boxes, t: "Carga optimizada", d: "Lo que entregas último va al fondo, lo pesado abajo y nada encima de lo frágil." },
          { icon: RouteIcon, t: "Rutas venezolanas", d: "Distancias, tiempo estimado, peajes y alcabalas aproximadas en la red troncal." },
          { icon: Repeat, t: "Carga de retorno", d: "Publica tu espacio libre y recibe solicitudes de carga en la bolsa de viajes." },
        ].map(({ icon: I, t, d }) => (
          <div key={t} className="rounded-lg border border-border bg-card p-6">
            <I className="h-6 w-6 text-primary" />
            <h2 className="mt-4 text-lg font-bold">{t}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
