import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/panel")({
  beforeLoad: async () => {
    // Solo UX: user_metadata lo edita el propio usuario; los datos siguen
    // protegidos por RLS. Un cliente cae en la bolsa, no en el panel.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.user_metadata?.["role"] === "cliente") {
      throw redirect({ to: "/bolsa" });
    }
  },
  component: () => <Outlet />,
});
