import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

const links = [
  { to: "/panel/viajes/nuevo", label: "Planificar un viaje" },
  { to: "/bolsa", label: "Bolsa de viajes" },
  { to: "/panel/viajes", label: "Mis viajes" },
  { to: "/panel/vehiculos", label: "Mis vehículos" },
] as const;

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Carga más. No regreses vacío. Planifica la carga en 3D, estima la ruta y comparte el
              espacio libre de tus viajes de ida y vuelta.
            </p>
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-primary">
              Valencia · Caracas · Puerto Cabello
            </p>
          </div>
          <nav aria-label="Pie de página">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Navegar
            </h2>
            <ul className="mt-4 space-y-2.5">
              {links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6">
          <p className="font-mono text-xs text-muted-foreground">
            © {new Date().getFullYear()} CargaRuta · Venezuela
          </p>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Carga · Ruta · Viaje
          </p>
        </div>
      </div>
    </footer>
  );
}
