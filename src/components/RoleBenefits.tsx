import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  CreditCard,
  Handshake,
  LayoutGrid,
  Route as RouteIcon,
  Search,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const roles = [
  {
    id: "cliente",
    eyebrow: "Soy cliente",
    title: "Necesito mover una carga",
    icon: Boxes,
    cta: "Buscar un camión",
    to: "/bolsa" as const,
    benefits: [
      {
        icon: Search,
        title: "Camiones que ya van hacia allá",
        text: "La bolsa se filtra por origen y destino: ves las rutas que pasan cerca de tu carga, no toda la flota.",
      },
      {
        icon: Boxes,
        title: "Ves el espacio real antes de pedir",
        text: "El camión se muestra en 3D con su espacio libre y una vista previa de tu paquete.",
      },
      {
        icon: ClipboardList,
        title: "Solicitud sin crear cuenta",
        text: "Dejas el punto de recogida, las medidas y tu contacto. El conductor decide si lo lleva.",
      },
      {
        icon: CreditCard,
        title: "Pago claro y en bolívares",
        text: "Pagas a la tasa BCV, subes el comprobante y ves cuándo tu paquete entra al plan de carga.",
      },
    ],
  },
  {
    id: "conductor",
    eyebrow: "Soy conductor",
    title: "Hago una ruta con mi camión",
    icon: Truck,
    cta: "Publicar mi ruta",
    to: "/viajes/nuevo" as const,
    benefits: [
      {
        icon: Truck,
        title: "Tu ruta deja de ir vacía",
        text: "Publicas el espacio libre de ida y vuelta y lo llenas con paquetes que ya van en tu misma dirección.",
      },
      {
        icon: LayoutGrid,
        title: "Qué entra y cómo se acomoda",
        text: "El plan 3D respeta peso y medidas, y la guía te ordena el montaje por capas y por paso.",
      },
      {
        icon: Wallet,
        title: "Tú decides qué sube y cuánto cobras",
        text: "Aceptas o rechazas solicitudes y fijas el precio del flete en dólares. La plataforma gestiona el cobro y luego te liquida.",
      },
      {
        icon: RouteIcon,
        title: "Ruta y costos a la vista",
        text: "Kilómetros reales, peajes y alcabalas para cotizar sin adivinar, tanto en la ida como en la vuelta.",
      },
    ],
  },
];

export function RoleBenefits() {
  return (
    <section className="border-b border-border bg-secondary/15">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Beneficios por rol
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
            Cada lado de la ruta
            <br />
            tiene su tablero.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Si necesitas mover algo, ves camiones y espacio disponible. Si haces la ruta, publicas
            el espacio, armas la carga y cobras. Cada rol entra a lo suyo, sin pasos de más.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {roles.map(({ id, eyebrow, title, icon: RoleIcon, benefits, cta, to }) => (
            <article
              key={id}
              className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-muted-foreground"
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    id === "conductor"
                      ? "grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
                      : "grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-secondary text-primary"
                  }
                >
                  <RoleIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    {eyebrow}
                  </p>
                  <h3 className="text-lg font-bold leading-tight">{title}</h3>
                </div>
              </div>

              <ul className="mt-6 flex-1 space-y-4">
                {benefits.map(({ icon: Icon, title: benefit, text }) => (
                  <li key={benefit} className="flex gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{benefit}</p>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">{text}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <Button asChild variant="outline" className="mt-6 w-full sm:w-auto sm:self-start">
                <Link to={to}>
                  {cta} <ArrowRight />
                </Link>
              </Button>
            </article>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4">
          <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Mismo viaje, misma información.</strong> El cliente
            sigue su paquete y el conductor sabe qué recoger, dónde entregarlo y cuánto cobra. El
            plan de carga se actualiza cuando el pago se confirma.
          </p>
        </div>
      </div>
    </section>
  );
}
