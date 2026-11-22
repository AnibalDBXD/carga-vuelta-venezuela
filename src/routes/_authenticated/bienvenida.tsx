import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Boxes, CheckCircle2, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bienvenida")({
  head: () => ({
    meta: [
      { title: "Bienvenida — CargaRuta" },
      {
        name: "description",
        content: "Elige tu rol: busca espacio para tu carga o publica tu ruta.",
      },
      { property: "og:title", content: "Bienvenida — CargaRuta" },
      {
        property: "og:description",
        content: "Elige tu rol: busca espacio para tu carga o publica tu ruta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WelcomePage,
});

type Step = "rol" | "datos" | "revision" | "aprobado";

// Demo: la "aprobación" del conductor se resuelve sola al cabo de un par de
// segundos, como la verificación simulada de pago.
const REVIEW_MS = 2000;
const APPROVED_BEAT_MS = 1200;

function WelcomePage() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const meta = session?.user.user_metadata as Record<string, unknown> | undefined;
  const driverStatus = typeof meta?.["driver_status"] === "string" ? meta["driver_status"] : null;
  const [step, setStep] = useState<Step>("rol");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [cedula, setCedula] = useState("");
  const [phone, setPhone] = useState("58");

  // Reanuda el flujo tras un refresh: pendiente → revisión, aprobado → panel.
  useEffect(() => {
    if (step !== "rol") return;
    if (driverStatus === "approved") navigate({ to: "/panel/viajes", replace: true });
    else if (driverStatus === "pending") setStep("revision");
  }, [driverStatus, step, navigate]);

  // Verificación simulada: ~2 s de "revisión" y la cuenta queda aprobada.
  useEffect(() => {
    if (step !== "revision") return;
    const t = setTimeout(() => {
      void supabase.auth
        .updateUser({
          data: { driver_status: "approved", driver_approved_at: new Date().toISOString() },
        })
        .then(({ error }) => {
          if (error) toast.error("No se pudo confirmar la aprobación");
          else setStep("aprobado");
        });
    }, REVIEW_MS);
    return () => clearTimeout(t);
  }, [step]);

  // Beat de éxito y al panel; el botón permite saltar la espera.
  useEffect(() => {
    if (step !== "aprobado") return;
    const t = setTimeout(() => navigate({ to: "/panel/viajes" }), APPROVED_BEAT_MS);
    return () => clearTimeout(t);
  }, [step, navigate]);

  const pickCliente = async () => {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { role: "cliente" } });
    setBusy(false);
    if (error) return void toast.error("No se pudo guardar tu elección");
    navigate({ to: "/bolsa" });
  };

  const submitDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        role: "conductor",
        full_name: name.trim(),
        cedula: cedula.trim(),
        phone: phone.trim(),
        driver_status: "pending",
        driver_submitted_at: new Date().toISOString(),
      },
    });
    setBusy(false);
    if (error) return void toast.error("No se pudo guardar tus datos");
    setStep("revision");
  };

  if (!ready) {
    return (
      <main className="grid min-h-[calc(100vh-3.75rem)] place-items-center grid-asphalt px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className="grid min-h-[calc(100vh-3.75rem)] place-items-center grid-asphalt px-4 py-10">
      <div className="w-full max-w-2xl">
        {step === "rol" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold" style={{ viewTransitionName: "page-title" }}>
              ¿Qué te trae por aquí?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Elige cómo vas a usar CargaRuta. Puedes entrar a lo otro desde el menú después.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={pickCliente}
                className="flex flex-col rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-muted-foreground"
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary">
                  <Boxes className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-primary">
                  Soy cliente
                </p>
                <h2 className="mt-1 text-lg font-bold leading-tight">Necesito mover una carga</h2>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  Buscas un camión con espacio libre en la bolsa de viajes y pides tu recogida.
                </p>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep("datos")}
                className={cn(
                  "flex flex-col rounded-xl border border-border bg-card p-6 text-left transition-colors",
                  "hover:border-muted-foreground",
                )}
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Truck className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-primary">
                  Quiero ser conductor
                </p>
                <h2 className="mt-1 text-lg font-bold leading-tight">Hago rutas con mi camión</h2>
                <p className="mt-2 text-sm leading-snug text-muted-foreground">
                  Publicas tu espacio libre, armas la carga en 3D y decides cuánto cobras.
                </p>
              </button>
            </div>
          </div>
        )}

        {step === "datos" && (
          <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
            <h1 className="text-2xl font-bold" style={{ viewTransitionName: "page-title" }}>
              Registro de conductor
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tus datos de contacto para las solicitudes de carga.
            </p>
            <form onSubmit={submitDriver} className="mt-6 space-y-3">
              <div>
                <Label htmlFor="d-name">Nombre completo</Label>
                <Input
                  id="d-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="José Rodríguez"
                />
              </div>
              <div>
                <Label htmlFor="d-cedula">Cédula</Label>
                <Input
                  id="d-cedula"
                  required
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="V-12345678"
                />
              </div>
              <div>
                <Label htmlFor="d-phone">WhatsApp (con código 58)</Label>
                <Input
                  id="d-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="584121234567"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Enviar registro
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setStep("rol")}
              >
                Volver
              </button>
            </form>
          </div>
        )}

        {step === "revision" && (
          <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-xl">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold">Verificando tus datos…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Estamos revisando tu registro de conductor. Toma unos segundos.
            </p>
          </div>
        )}

        {step === "aprobado" && (
          <div className="mx-auto w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-xl">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-bold">¡Listo, conductor!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu cuenta de conductor quedó aprobada. Ya puedes crear tu primer viaje.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/panel/viajes" })}>
              Ir a mi panel
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
