import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — CargaRuta" },
      { name: "description", content: "Accede a CargaRuta para planificar tus viajes de carga." },
      { property: "og:title", content: "Entrar — CargaRuta" },
      {
        property: "og:description",
        content: "Accede a CargaRuta para planificar tus viajes de carga.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up" && password !== confirm) {
      return void toast.error("Las contraseñas no coinciden");
    }
    setBusy(true);
    if (mode === "in") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return void toast.error("Correo o contraseña incorrectos");
      const role = data.user?.user_metadata?.["role"];
      navigate({ to: role === "cliente" ? "/bolsa" : "/panel/viajes" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) return void toast.error(error.message);
      // Local no pide confirmar correo: hay sesión y sigue la elección de rol.
      if (data.session) return void navigate({ to: "/bienvenida" });
      toast.success("Revisa tu correo para confirmar tu cuenta");
    }
  };

  return (
    <main className="grid min-h-[calc(100vh-3.75rem)] place-items-center grid-asphalt px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
        <h1 className="text-2xl font-bold" style={{ viewTransitionName: "page-title" }}>
          {mode === "in" ? "Entrar" : "Crear cuenta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Para conductores y clientes.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pw">Contraseña</Label>
            <Input
              id="pw"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "up" && (
            <div>
              <Label htmlFor="pw2">Confirmar contraseña</Label>
              <Input
                id="pw2"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </div>
    </main>
  );
}
