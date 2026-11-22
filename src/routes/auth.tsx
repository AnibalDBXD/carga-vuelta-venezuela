import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

function authErrorMessage(
  error: { status?: number | undefined; code?: string | undefined },
  fallback: string,
): string {
  return error.status === 429 || error.code === "over_request_rate_limit"
    ? "Demasiados intentos — espera unos minutos y vuelve a probar"
    : fallback;
}

async function withRateLimitRetry<T extends { error: { status?: number | undefined } | null }>(
  fn: () => Promise<T>,
): Promise<T> {
  let res = await fn();
  for (const delay of [4000, 8000]) {
    if (res.error?.status !== 429) break;
    await new Promise((r) => setTimeout(r, delay));
    res = await fn();
  }
  return res;
}

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

  const signInGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) toast.error(authErrorMessage(error, "No se pudo iniciar con Google"));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up" && password !== confirm) {
      return void toast.error("Las contraseñas no coinciden");
    }
    setBusy(true);
    if (mode === "in") {
      const { data, error } = await withRateLimitRetry(() =>
        supabase.auth.signInWithPassword({ email, password }),
      );
      setBusy(false);
      if (error)
        return void toast.error(authErrorMessage(error, "Correo o contraseña incorrectos"));
      const role = data.user?.user_metadata?.["role"];
      navigate({ to: role === "cliente" ? "/bolsa" : "/panel/viajes" });
    } else {
      const { data, error } = await withRateLimitRetry(() =>
        supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        }),
      );
      setBusy(false);
      if (error) return void toast.error(authErrorMessage(error, error.message));
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
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          disabled={busy}
          onClick={signInGoogle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
            />
          </svg>
          Continuar con Google
        </Button>
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
