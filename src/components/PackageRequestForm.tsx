import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCircle2, CreditCard, Package, Plus, Send, X } from "lucide-react";
import type { Pkg } from "@/lib/packing";
import { CARGO_PRESETS, type CargoPreset } from "@/lib/venezuela";
import type { PackageRequestBody } from "@/lib/package-request";
import { subscribeToRequest, pushSupported } from "@/lib/push-client";
import { rememberRequest } from "@/lib/my-requests";
import { getBotInfo } from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AddressField, type GeoPoint } from "@/components/AddressField";

function pkgFromForm(data: FormData, key: number, fragile: boolean): Pkg | null {
  const str = (name: string) => String(data.get(`${name}-${key}`) ?? "");
  const num = (name: string) => Number(str(name));
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
    id: `preview-${key}`,
    name: str("name").trim() || "Tu carga",
    ...pkg,
    fragile,
    deadline: "",
    recipient: "",
  };
}

function currentPkgs(
  form: HTMLFormElement | null,
  items: number[],
  fragile: Record<number, boolean>,
): Pkg[] {
  if (!form) return [];
  const data = new FormData(form);
  return items
    .map((key) => pkgFromForm(data, key, fragile[key] ?? false))
    .filter((p): p is Pkg => p !== null);
}

// Datos ficticios para presentaciones: Shift+J (fuera de un campo) los rellena.
// El correo es válido para la validación pero claramente de demo.
const DEMO = {
  sender: "María González",
  phone: "04141234567",
  email: "demo@cargaruta.local",
  packages: [
    {
      name: "Saco de 50 kg",
      length: 80,
      width: 50,
      height: 30,
      weight: 50,
      qty: 3,
      fragile: false,
    },
    { name: "Televisor", length: 125, width: 75, height: 15, weight: 15, qty: 1, fragile: true },
  ] satisfies Partial<Pkg>[],
};

export function PackageRequestForm({
  onSubmit,
  onPreview,
  onPickupPoint,
  onDeliveryPoint,
  demo,
}: {
  onSubmit: (body: PackageRequestBody) => Promise<string | undefined>;
  onPreview?: (pkgs: Pkg[]) => void;
  onPickupPoint?: (p: GeoPoint | null) => void;
  onDeliveryPoint?: (p: GeoPoint | null) => void;
  demo?: { pickup?: GeoPoint | undefined; delivery?: GeoPoint | undefined } | undefined;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const nextKey = useRef(1);
  const [items, setItems] = useState<number[]>([0]);
  const [fragile, setFragile] = useState<Record<number, boolean>>({ 0: false });
  // Valores iniciales por bulto al usar un preset o el autofill de demo
  // (los campos quedan editables).
  const [prefill, setPrefill] = useState<Record<number, Partial<Pkg>>>({});
  // Autofill de demo: seq fuerza el remount de los AddressField (son controlados).
  const [demoFill, setDemoFill] = useState<{
    seq: number;
    pickup?: string | undefined;
    delivery?: string | undefined;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | undefined>();
  const { data: bot } = useQuery({
    queryKey: ["telegram-bot"],
    queryFn: () => getBotInfo(),
    enabled: requestId !== undefined,
    staleTime: 10 * 60 * 1000,
  });
  const [push, setPush] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => onPreview?.(currentPkgs(formRef.current, items, fragile)),
      350,
    );
  }, [items, fragile, onPreview]);
  useEffect(emit, [emit]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const addItem = (preset?: CargoPreset) => {
    const key = nextKey.current++;
    setItems((list) => [...list, key]);
    setFragile((f) => ({ ...f, [key]: preset?.fragile ?? false }));
    if (preset) setPrefill((p) => ({ ...p, [key]: preset }));
  };
  // Shift+J: rellena todo con datos ficticios para no perder tiempo en la demo.
  const fillDemo = useCallback(() => {
    const form = formRef.current;
    if (!form || requestId !== undefined) return;
    const set = (name: string, v: string) => {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = v;
    };
    set("sender", DEMO.sender);
    set("phone", DEMO.phone);
    set("email", DEMO.email);
    const keys = DEMO.packages.map(() => nextKey.current++);
    setItems(keys);
    setPrefill(Object.fromEntries(keys.map((k, i) => [k, DEMO.packages[i]!])));
    setFragile(Object.fromEntries(keys.map((k, i) => [k, DEMO.packages[i]!.fragile ?? false])));
    setDemoFill((d) => ({
      seq: (d?.seq ?? 0) + 1,
      pickup: demo?.pickup?.label,
      delivery: demo?.delivery?.label,
    }));
    onPickupPoint?.(demo?.pickup ?? null);
    onDeliveryPoint?.(demo?.delivery ?? null);
  }, [requestId, demo, onPickupPoint, onDeliveryPoint]);
  // Ignora el atajo al escribir dentro de un campo: la "J" mayúscula debe seguir
  // pudiendo teclearse (nombres como "José").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyJ" || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        t?.isContentEditable
      )
        return;
      e.preventDefault();
      fillDemo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fillDemo]);
  // emit() se recrea cuando items/fragile cambian: dispararlo tras el autofill
  // actualiza la vista previa 3D con los bultos ya montados.
  useEffect(() => {
    if (demoFill) emit();
  }, [demoFill, emit]);
  const removeItem = (key: number) => {
    setItems((list) => list.filter((k) => k !== key));
    setFragile((f) => {
      const rest = { ...f };
      delete rest[key];
      return rest;
    });
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (key: string) => String(form.get(key) ?? "");
    setBusy(true);
    setError("");
    try {
      const packages = items.map((key) => {
        const val = (name: string) => String(form.get(`${name}-${key}`) ?? "");
        return {
          name: val("name"),
          length: Number(val("length")),
          width: Number(val("width")),
          height: Number(val("height")),
          weight: Number(val("weight")),
          qty: Number(val("qty")),
          fragile: fragile[key] ?? false,
          deadline: val("deadline"),
        };
      });
      const id = await onSubmit({
        sender: str("sender"),
        phone: str("phone"),
        email: str("email"),
        pickup: str("pickup"),
        delivery: str("delivery"),
        notes: str("notes"),
        packages,
      });
      if (!id) throw new Error();
      if (timer.current) clearTimeout(timer.current);
      onPreview?.([]);
      rememberRequest(id);
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
          Tu carga queda pendiente de la aprobación del conductor. Si la acepta, te llega un correo
          con el enlace para pagar — guarda también este enlace:
        </p>
        {requestId && (
          <Button asChild variant="outline" className="mt-4">
            <Link to="/pagos/$requestId" params={{ requestId }}>
              <CreditCard /> Ir a mi página de pago
            </Link>
          </Button>
        )}
        {bot?.username && requestId && (
          <div>
            <Button asChild variant="outline" className="mt-4">
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`https://t.me/${bot.username}?start=req_${requestId}`}
              >
                <Send /> Continuar en Telegram
              </a>
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">
              El asistente te avisa cuando te acepten y toma tu pago por chat.
            </p>
          </div>
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
        <AddressField
          key={`pickup-${demoFill?.seq ?? 0}`}
          name="pickup"
          label="Dirección de recogida"
          minLength={5}
          maxLength={500}
          placeholder="Ciudad, sector, calle y referencia"
          initialValue={demoFill?.pickup}
          onPoint={onPickupPoint}
        />
        <AddressField
          key={`delivery-${demoFill?.seq ?? 0}`}
          name="delivery"
          label="Dirección de entrega"
          minLength={5}
          maxLength={500}
          placeholder="Ciudad, sector, calle y referencia"
          initialValue={demoFill?.delivery}
          onPoint={onDeliveryPoint}
        />
      </section>
      <section className="space-y-4 border-t border-border pt-5">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Package /> Tu carga
        </h2>
        <p className="text-sm text-muted-foreground">
          Agrega todos los bultos que necesitas: la vista previa muestra cómo entran en el espacio
          libre del camión.
        </p>
        <div className="space-y-6">
          {items.map((key, index) => {
            const pre = prefill[key];
            return (
              <fieldset key={key} className="space-y-4 rounded-lg border border-border p-4">
                <legend className="sr-only">Bulto {index + 1}</legend>
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Bulto {index + 1}
                  </p>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar bulto ${index + 1}`}
                      onClick={() => removeItem(key)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
                <Field
                  name={`name-${key}`}
                  label="Descripción"
                  minLength={2}
                  maxLength={200}
                  defaultValue={pre?.name}
                  placeholder="Ej. Cajas de vasos de vidrio"
                />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field
                    name={`length-${key}`}
                    label="Largo (cm)"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={pre?.length}
                  />
                  <Field
                    name={`width-${key}`}
                    label="Ancho (cm)"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={pre?.width}
                  />
                  <Field
                    name={`height-${key}`}
                    label="Alto (cm)"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={pre?.height}
                  />
                  <Field
                    name={`weight-${key}`}
                    label="Peso por bulto (kg)"
                    type="number"
                    min={0.01}
                    max={10000}
                    step="0.01"
                    defaultValue={pre?.weight}
                  />
                  <Field
                    name={`qty-${key}`}
                    label="Cantidad"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={pre?.qty ?? 1}
                  />
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`fragile-${key}`}
                      checked={fragile[key] ?? false}
                      onCheckedChange={(v) => setFragile((f) => ({ ...f, [key]: v }))}
                    />
                    <Label htmlFor={`fragile-${key}`}>Frágil</Label>
                  </div>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Plazo de entrega (opcional)
                  </summary>
                  <div className="mt-3">
                    <Field
                      name={`deadline-${key}`}
                      label="Entregar antes de"
                      type="datetime-local"
                      required={false}
                    />
                  </div>
                </details>
              </fieldset>
            );
          })}
        </div>
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Añade rápido con un bulto común (puedes ajustar las medidas):
          </p>
          <div className="flex flex-wrap gap-2">
            {CARGO_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => addItem(p)}
              >
                <Plus /> {p.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => addItem()}>
              <Plus /> Otro bulto
            </Button>
          </div>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Notas para el conductor (opcional)
          </summary>
          <div className="mt-3">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" maxLength={2000} />
          </div>
        </details>
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
