import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, CheckCircle2, CreditCard, Package, Send } from "lucide-react";
import type { Pkg } from "@/lib/packing";
import type { PackageRequestBody } from "@/lib/package-request";
import { subscribeToRequest, pushSupported } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

function currentPkg(form: HTMLFormElement | null, fragile: boolean): Pkg | null {
  if (!form) return null;
  const data = new FormData(form);
  const str = (key: string) => String(data.get(key) ?? "");
  const num = (key: string) => Number(data.get(key));
  const pkg = {
    length: num("length"),
    width: num("width"),
    height: num("height"),
    weight: num("weight"),
    qty: num("qty"),
  };
  if (
    !(pkg.length > 0 && pkg.width > 0 && pkg.height > 0 && pkg.weight > 0) ||
    !Number.isInteger(pkg.qty) ||
    pkg.qty < 1 ||
    pkg.qty > 100
  )
    return null;
  return {
    id: "preview",
    name: str("name").trim() || "Tu carga",
    ...pkg,
    fragile,
    deadline: "",
    recipient: "",
  };
}

export function PackageRequestForm({
  onSubmit,
  onPreview,
}: {
  onSubmit: (body: PackageRequestBody) => Promise<string | undefined>;
  onPreview?: (pkg: Pkg | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fragile, setFragile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | undefined>();
  const [push, setPush] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onPreview?.(currentPkg(formRef.current, fragile)), 350);
  }, [fragile, onPreview]);
  useEffect(emit, [emit]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (key: string) => String(form.get(key) ?? "");
    setBusy(true);
    setError("");
    try {
      const id = await onSubmit({
        sender: str("sender"),
        phone: str("phone"),
        email: str("email"),
        pickup: str("pickup"),
        delivery: str("delivery"),
        notes: str("notes"),
        package: {
          name: str("name"),
          length: Number(str("length")),
          width: Number(str("width")),
          height: Number(str("height")),
          weight: Number(str("weight")),
          qty: Number(str("qty")),
          fragile,
          deadline: str("deadline"),
        },
      });
      if (!id) throw new Error();
      if (timer.current) clearTimeout(timer.current);
      onPreview?.(null);
      setRequestId(id);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa los datos o intenta más tarde.");
    } finally {
      setBusy(false);
    }
  };
  const notify = async () => {
    if (!requestId) return;
    setPush("busy");
    const ok = await subscribeToRequest(requestId).catch(() => false);
    setPush(ok ? "done" : "idle");
    if (ok) toast.success("Te avisaremos cuando el conductor responda");
    else toast.error("No se pudo activar el aviso. Te llegará el correo igual.");
  };
  if (requestId !== undefined)
    return (
      <section className="mt-8 border-y border-border py-8" aria-live="polite">
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <h2 className="mt-3 text-2xl font-bold">Solicitud enviada</h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Tu paquete queda pendiente de la aprobación del conductor. Si la acepta, te llega un
          correo con el enlace para pagar — guarda también este enlace:
        </p>
        {requestId && (
          <Button asChild variant="outline" className="mt-4">
            <Link to="/pagos/$requestId" params={{ requestId }}>
              <CreditCard /> Ir a mi página de pago
            </Link>
          </Button>
        )}
        {pushSupported() && requestId && (
          <div className="mt-3">
            <Button variant="ghost" disabled={push !== "idle"} onClick={notify}>
              <Bell />{" "}
              {push === "done" ? "Aviso activado" : "Avísame por notificación cuando me acepten"}
            </Button>
          </div>
        )}
        <div>
          <Button
            variant="link"
            className="mt-4 px-0"
            onClick={() => {
              setRequestId(undefined);
              setPush("idle");
            }}
          >
            Solicitar otra recogida
          </Button>
        </div>
      </section>
    );
  return (
    <form ref={formRef} onSubmit={submit} onChange={emit} className="mt-8 space-y-7">
      <section className="space-y-4 border-t border-border pt-5">
        <h2 className="text-xl font-bold">Contacto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="sender" label="Tu nombre" minLength={2} maxLength={100} />
          <Field name="phone" label="Teléfono / WhatsApp" type="tel" minLength={7} maxLength={30} />
        </div>
        <Field
          name="email"
          label="Correo electrónico"
          type="email"
          maxLength={254}
          placeholder="Para avisarte y enviarte el enlace de pago"
        />
      </section>
      <section className="space-y-4 border-t border-border pt-5">
        <h2 className="text-xl font-bold">Recogida y entrega</h2>
        <Field
          name="pickup"
          label="Dirección de recogida"
          minLength={5}
          maxLength={500}
          placeholder="Ciudad, sector, calle y referencia"
        />
        <Field
          name="delivery"
          label="Dirección de entrega"
          minLength={5}
          maxLength={500}
          placeholder="Ciudad, sector, calle y referencia"
        />
      </section>
      <section className="space-y-4 border-t border-border pt-5">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Package /> Detalles del paquete
        </h2>
        <Field
          name="name"
          label="Descripción"
          minLength={2}
          maxLength={200}
          placeholder="Ej. Cajas de vasos de vidrio"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field name="length" label="Largo (cm)" type="number" min={1} max={10000} />
          <Field name="width" label="Ancho (cm)" type="number" min={1} max={10000} />
          <Field name="height" label="Alto (cm)" type="number" min={1} max={10000} />
          <Field
            name="weight"
            label="Peso por bulto (kg)"
            type="number"
            min={0.01}
            max={10000}
            step="0.01"
          />
          <Field
            name="qty"
            label="Cantidad de bultos"
            type="number"
            min={1}
            max={100}
            defaultValue="1"
          />
          <div className="flex items-center gap-3">
            <Switch id="fragile" checked={fragile} onCheckedChange={setFragile} />
            <Label htmlFor="fragile">Frágil</Label>
          </div>
        </div>
        <Field
          name="deadline"
          label="Entregar antes de (opcional)"
          type="datetime-local"
          required={false}
        />
        <div>
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" maxLength={2000} />
        </div>
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" type="submit" disabled={busy}>
        <Send /> {busy ? "Enviando…" : "Enviar solicitud de recogida"}
      </Button>
    </form>
  );
}
function Field({
  name,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required {...props} />
    </div>
  );
}
