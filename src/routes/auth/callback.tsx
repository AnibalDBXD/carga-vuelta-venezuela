import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Entrando — CargaRuta" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    const routeByRole = (session: Session) => {
      done = true;
      const role = session.user?.user_metadata?.["role"];
      navigate({
        to: role === "cliente" ? "/bolsa" : role ? "/panel/viajes" : "/bienvenida",
        replace: true,
      });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!done && data.session) routeByRole(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!done && event === "SIGNED_IN" && session) routeByRole(session);
    });
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      toast.error("No se pudo iniciar sesión");
      navigate({ to: "/auth", replace: true });
    }, 10000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [navigate]);

  return (
    <main className="grid min-h-[calc(100vh-3.75rem)] place-items-center grid-asphalt px-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
    </main>
  );
}
