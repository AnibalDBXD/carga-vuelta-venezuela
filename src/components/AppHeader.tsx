import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export function AppHeader() {
  const { session } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors [&.active]:text-primary";
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="h-1 hazard-stripe" />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CargaRuta · inicio">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          <Link to="/bolsa" className={link}>Bolsa de viajes</Link>
          {session && (<>
            <Link to="/viajes" className={link}>Mis viajes</Link>
            <Link to="/vehiculos" className={link}>Mis vehículos</Link>
          </>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {session ? (<>
            <Button size="sm" variant="ghost" onClick={signOut}>Salir</Button>
          </>) : (
            <Button asChild size="sm"><Link to="/auth">Entrar</Link></Button>
          )}
        </div>
      </div>
      {session && (
        <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
          <Link to="/viajes" className={link}>Viajes</Link>
          <Link to="/vehiculos" className={link}>Vehículos</Link>
          <Link to="/bolsa" className={link}>Bolsa</Link>
        </nav>
      )}
    </header>
  );
}
