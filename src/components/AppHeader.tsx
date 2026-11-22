import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Route as RouteIcon, Search, Truck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

type RoleItem = {
  to: "/bolsa" | "/panel/viajes" | "/panel/vehiculos";
  label: string;
  icon: typeof Search;
};

const clientItems: RoleItem[] = [{ to: "/bolsa", label: "Bolsa de viajes", icon: Search }];

const driverItems: RoleItem[] = [
  { to: "/panel/viajes", label: "Mis viajes", icon: RouteIcon },
  { to: "/panel/vehiculos", label: "Mis vehículos", icon: Truck },
];

function RoleMenu({
  label,
  hint,
  items,
  active,
  mobile = false,
}: {
  label: string;
  hint: string;
  items: RoleItem[];
  active: boolean;
  mobile?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground",
            mobile && "flex-1 justify-between",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={mobile ? "center" : "end"}
        className={cn("w-56", mobile && "w-[calc(100vw-2rem)]")}
      >
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {hint}
        </DropdownMenuLabel>
        {items.map(({ to, label: itemLabel, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild>
            <Link to={to} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              {itemLabel}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const { session } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const clientActive = pathname === "/bolsa" || pathname.startsWith("/bolsa/");
  const driverActive = pathname.startsWith("/panel");

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="h-1 hazard-stripe" />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CargaRuta · inicio">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <nav aria-label="Accesos por rol" className="hidden items-center gap-1 md:flex">
            <RoleMenu
              label="Soy conductor"
              hint="Tu operación"
              items={driverItems}
              active={driverActive}
            />
            <RoleMenu
              label="Soy cliente"
              hint="Buscar espacio"
              items={clientItems}
              active={clientActive}
            />
          </nav>
          {session ? (
            <Button size="sm" variant="ghost" onClick={signOut}>
              Salir
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}
        </div>
      </div>
      <nav
        aria-label="Accesos por rol"
        className="flex gap-1 border-t border-border px-4 py-2 md:hidden"
      >
        <RoleMenu
          label="Soy conductor"
          hint="Tu operación"
          items={driverItems}
          active={driverActive}
          mobile
        />
        <RoleMenu
          label="Soy cliente"
          hint="Buscar espacio"
          items={clientItems}
          active={clientActive}
          mobile
        />
      </nav>
    </header>
  );
}
