import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, Calculator, Layers, MapPin, Share2, Wallet } from "lucide-react";
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
              <Button asChild size="lg" variant="outline"><Link to="/retornos">Buscar camión de retorno</Link></Button>
            </div>
          </div>
          <Truck3DView kind="camion350" length={420} width={200} height={200} boxes={boxes} colorKeys={["a", "b", "c"]} className="h-[380px] overflow-hidden rounded-lg border border-border" />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Beneficios</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold leading-tight md:text-4xl">
          Que el camión no vuelva vacío.
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Cada tramo sin carga es dinero que se queda en la carretera. Así lo evita CargaRuta, con
          datos que ya están en la app.
        </p>
        <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Share2,
              t: "Publica el regreso antes de arrancar",
              d: "Marca el viaje como retorno y comparte un enlace. Quien tenga carga en esa ruta pide la recogida sin crear cuenta; tú apruebas qué sube.",
            },
            {
              icon: Wallet,
              t: "Cobra el tramo que ibas a perder",
              d: "Publicas los m³ y los kg libres y el interesado te escribe directo por WhatsApp. La app no cobra comisión ni retiene el pago.",
            },
            {
              icon: MapPin,
              t: "La carga ya va para allá",
              d: "En la bolsa de retornos se filtra por origen y destino: quien necesita enviar algo ve solo los camiones que salen hacia su ciudad, no la flota completa.",
            },
            {
              icon: Boxes,
              t: "Entra lo que de verdad cabe",
              d: "El acomodo 3D respeta el peso máximo, apila lo pesado abajo y no pone nada sobre lo frágil. Antes de cerrar la puerta sabes cuánto espacio queda.",
            },
            {
              icon: Calculator,
              t: "Flete cotizado con números",
              d: "Kilómetros, horas de marcha, peajes y alcabalas aproximadas de la red troncal, para poner precio al viaje sin adivinar.",
            },
            {
              icon: Layers,
              t: "Se carga una sola vez",
              d: "La guía ordena el montaje por capas y por paso, con el orden de descarga incluido. La cuadrilla no reacomoda a mitad de ruta.",
            },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="border-t border-border pt-5">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
