import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  Share2,
  X,
  Package,
  MapPin,
  MessageCircle,
  FileImage,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cityName, suggestStops, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { citiesAlongGeometry } from "@/lib/route-geometry";
import { staticRouteMapUrl } from "@/lib/mapbox";
import { tripRouteQuery } from "@/lib/routes.functions";
import { packCargo, type Container, type Pkg } from "@/lib/packing";
import { canvasToBlob, PROMO_FORMATS, renderPromoCard, type PromoFormat } from "@/lib/promo-image";
import { useSession } from "@/hooks/use-session";
import { formatBs, formatUsd } from "@/lib/pago-movil";
import { clientTotalUsd, type RequestStatus } from "@/lib/package-request";
import { getExchangeRate, notifyRequester } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Trip = {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string | null;
};
type ShareVehicle = {
  name: string;
  kind: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  max_kg: number;
};
export function ShareTrip({
  trip,
  vehicle,
  freeM3,
  freeKg,
}: {
  trip: Trip;
  vehicle?: ShareVehicle | null;
  freeM3?: number | undefined;
  freeKg?: number | undefined;
}) {
  const qc = useQueryClient();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [owner, setOwner] = useState("");
  const { data: route } = useQuery(tripRouteQuery(trip.origin, trip.destination));
  const suggestedStops = useMemo(
    () =>
      route?.geometry
        ? citiesAlongGeometry(route.geometry, trip.origin, trip.destination)
        : suggestStops(trip.origin, trip.destination),
    [route, trip.origin, trip.destination],
  );
  const [stops, setStops] = useState<string[]>(() =>
    suggestStops(trip.origin, trip.destination).map((c) => c.name),
  );
  const stopsTouched = useRef(false);
  useEffect(() => {
    if (!stopsTouched.current) setStops(suggestedStops.map((c) => c.name));
  }, [suggestedStops]);
  const mapToken = import.meta.env["VITE_MAPBOX_TOKEN"] as string | undefined;
  const routeMapUrl =
    route?.geometry && mapToken
      ? (staticRouteMapUrl(route.geometry, mapToken) ?? undefined)
      : undefined;
  const [format, setFormat] = useState<PromoFormat>("story");
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const renderSeq = useRef(0);
  const sessionName = () => {
    if (!session) return "";
    const meta = session.user.user_metadata as Record<string, unknown> | undefined;
    return (
      (typeof meta?.["full_name"] === "string" && meta["full_name"]) ||
      (typeof meta?.["name"] === "string" && meta["name"]) ||
      session.user.email?.split("@")[0] ||
      ""
    );
  };
  useEffect(() => {
    if (owner) return;
    const name = sessionName();
    if (name) setOwner(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, owner]);
  // El canvas vive dentro de un portal de Radix, que lo monta en un commit
  // posterior al del estado: usar callback ref (canvasEl) en vez de useRef para
  // que el efecto corra cuando el elemento realmente existe.
  useEffect(() => {
    if (!canvasEl || !open || !url || !vehicle) return;
    const seq = ++renderSeq.current;
    const scratch = document.createElement("canvas");
    void renderPromoCard(
      scratch,
      {
        ownerName: owner,
        url,
        originName: cityName(trip.origin),
        destinationName: cityName(trip.destination),
        date: trip.departure_date,
        departureTime: trip.departure_time?.slice(0, 5),
        stops,
        vehicle: {
          name: vehicle.name,
          kindLabel: VEHICLE_PRESETS[vehicle.kind as VehicleKind]?.label ?? vehicle.kind,
          lengthCm: vehicle.length_cm,
          widthCm: vehicle.width_cm,
          heightCm: vehicle.height_cm,
          maxKg: vehicle.max_kg,
        },
        freeM3: freeM3 ?? 0,
        freeKg: freeKg ?? 0,
        routeMapUrl,
      },
      format,
    )
      .then(() => {
        if (seq !== renderSeq.current) return;
        canvasEl.width = scratch.width;
        canvasEl.height = scratch.height;
        canvasEl.getContext("2d")?.drawImage(scratch, 0, 0);
      })
      .catch(() => {
        if (seq === renderSeq.current) toast.error("No se pudo generar la imagen");
      });
  }, [canvasEl, open, url, owner, stops, format, trip, vehicle, freeM3, freeKg, routeMapUrl]);
  // El enlace compartido es la oferta de la bolsa del viaje (un solo flujo público).
  const { data: offer } = useQuery({
    queryKey: ["trip-offer", trip.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_offers")
        .select("id, active")
        .eq("trip_id", trip.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const prepare = async () => {
    setBusy(true);
    try {
      let offerId = offer?.id;
      if (!offerId) {
        let veh = vehicle;
        let m3 = freeM3;
        let kg = freeKg;
        if (!veh || m3 === undefined || kg === undefined) {
          const { data: t } = await supabase
            .from("trips")
            .select("packages, vehicles(*)")
            .eq("id", trip.id)
            .single();
          veh ??= (t?.vehicles as ShareVehicle | null) ?? undefined;
          if (veh && (m3 === undefined || kg === undefined)) {
            const res = packCargo(
              {
                length: veh.length_cm,
                width: veh.width_cm,
                height: veh.height_cm,
                maxKg: veh.max_kg,
              },
              ((t?.packages as unknown as Pkg[]) ?? []).filter((p) => p.name && p.qty),
            );
            m3 ??= res.freeM3;
            kg ??= res.freeKg;
          }
        }
        if (!veh) throw new Error("El viaje no tiene vehículo asignado");
        const { data, error } = await supabase
          .from("return_offers")
          .insert({
            trip_id: trip.id,
            driver_name: owner || sessionName() || "Conductor",
            phone: "",
            origin: trip.origin,
            destination: trip.destination,
            available_date: trip.departure_date,
            available_time: trip.departure_time,
            vehicle_kind: veh.kind,
            free_m3: m3 ?? 0,
            free_kg: Math.round(kg ?? 0),
            notes: null,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error();
        offerId = data.id;
      }
      setUrl(`${window.location.origin}/bolsa/${offerId}`);
      await qc.invalidateQueries({ queryKey: ["trip-offer", trip.id] });
      await qc.invalidateQueries({ queryKey: ["return_offers"] });
    } catch {
      toast.error("No se pudo crear el enlace");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (!offer) return;
    setBusy(true);
    const { error } = await supabase
      .from("return_offers")
      .update({ active: !offer.active })
      .eq("id", offer.id);
    setBusy(false);
    if (error) return void toast.error("No se pudo cambiar la disponibilidad");
    await qc.invalidateQueries({ queryKey: ["trip-offer", trip.id] });
    await qc.invalidateQueries({ queryKey: ["return_offers"] });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("Selecciona y copia el enlace");
    }
  };
  const fileName = `cargaruta-${trip.origin}-${trip.destination}.png`;
  const promoBlob = async () => {
    if (!canvasEl) return null;
    const blob = await canvasToBlob(canvasEl);
    if (!blob) toast.error("No se pudo generar la imagen");
    return blob;
  };
  const download = async () => {
    const blob = await promoBlob();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const shareImage = async () => {
    const blob = await promoBlob();
    if (!blob) return;
    const file = new File([blob], fileName, { type: "image/png" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Espacio en camión" });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    await download();
    toast("Imagen descargada: compártela desde tu galería");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void prepare();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 /> Compartir espacio
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recibir encomiendas en este viaje</DialogTitle>
        </DialogHeader>
        <p className="font-semibold">
          {cityName(trip.origin)} → {cityName(trip.destination)} · {trip.departure_date}
          {trip.departure_time ? ` · ${trip.departure_time.slice(0, 5)}` : ""}
        </p>
        <Label htmlFor={`share-${trip.id}`}>Enlace de solicitudes</Label>
        <Input id={`share-${trip.id}`} readOnly value={url} onFocus={(e) => e.target.select()} />
        <p className="text-sm text-muted-foreground">
          {offer?.active === false ? "Solicitudes cerradas" : "Solicitudes abiertas"} · Los pedidos
          quedan pendientes hasta que los aceptes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !url} onClick={copy}>
            <Copy /> Copiar enlace
          </Button>
          <Button asChild variant="outline" disabled={!url}>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`Tengo espacio para carga ${cityName(trip.origin)} → ${cityName(trip.destination)} el ${trip.departure_date}${trip.departure_time ? ` a las ${trip.departure_time.slice(0, 5)}` : ""}. Solicita espacio: ${url}`)}`}
            >
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          {offer && (
            <Button variant="ghost" disabled={busy} onClick={toggle}>
              {offer.active ? "Cerrar solicitudes" : "Reabrir solicitudes"}
            </Button>
          )}
        </div>
        {url && vehicle && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="font-mono text-xs uppercase text-muted-foreground">Imagen promocional</p>
            <div>
              <Label htmlFor={`promo-name-${trip.id}`}>Tu nombre</Label>
              <Input
                id={`promo-name-${trip.id}`}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Nombre del conductor"
              />
            </div>
            {suggestedStops.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Paradas posibles (toca para incluir o quitar)
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestedStops.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={stops.includes(c.name) ? "default" : "outline"}
                      aria-pressed={stops.includes(c.name)}
                      onClick={() => {
                        stopsTouched.current = true;
                        setStops((s) =>
                          s.includes(c.name) ? s.filter((x) => x !== c.name) : [...s, c.name],
                        );
                      }}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2" role="group" aria-label="Formato de imagen">
              {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={format === f ? "secondary" : "outline"}
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                >
                  {PROMO_FORMATS[f].label}
                </Button>
              ))}
            </div>
            <canvas
              ref={setCanvasEl}
              aria-label="Vista previa de la imagen promocional"
              className="mx-auto max-h-[400px] w-auto max-w-full rounded-md border border-border"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={download}>
                <Download /> Descargar PNG
              </Button>
              <Button type="button" variant="outline" onClick={shareImage}>
                <Share2 /> Compartir imagen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pendiente",
  awaiting_payment: "Esperando pago",
  payment_review: "Comprobante recibido",
  paid: "Pagada",
  rejected: "Rechazada",
  expired: "Pago vencido",
};
const FILTERS: [RequestStatus | "all", string][] = [
  ["pending", "Pendientes"],
  ["awaiting_payment", "Esperando pago"],
  ["payment_review", "Comprobante recibido"],
  ["paid", "Pagadas"],
  ["rejected", "Rechazadas"],
  ["expired", "Vencidas"],
  ["all", "Todas"],
];

type RequestRow = {
  id: string;
  status: RequestStatus;
  sender_name: string;
  phone: string;
  email: string;
  pickup_address: string;
  delivery_address: string;
  notes: string;
  amount_usd: number | null;
  proof_path: string | null;
  package: unknown;
};

export function TripRequests({
  tripId,
  packages,
  container,
  routeKm,
  onAccepted,
}: {
  tripId: string;
  packages: Pkg[];
  container: Container;
  routeKm?: number | undefined;
  onAccepted: () => void;
}) {
  const qc = useQueryClient();
  const notify = useServerFn(notifyRequester);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [accepting, setAccepting] = useState<RequestRow | null>(null);
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["package-requests", tripId],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_requests")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RequestRow[];
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["package-requests", tripId] }),
      qc.invalidateQueries({ queryKey: ["trip", tripId] }),
      qc.invalidateQueries({ queryKey: ["trips"] }),
    ]);
  // Si el pagador cierra su página tras subir el comprobante, la verificación
  // simulada (~2 s) igual corre desde el lado del conductor: el RPC confirm_payment
  // está otorgado a authenticated y confirma bajo locks como en /pagos.
  const reviewKey = data
    .filter((r) => r.status === "payment_review")
    .map((r) => r.id)
    .join(",");
  useEffect(() => {
    if (!reviewKey) return;
    const ids = reviewKey.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async (tries: number) => {
      for (const id of ids) {
        const { data: result, error } = await supabase.rpc("confirm_payment", {
          p_request: id,
        });
        if (!cancelled && !error && result === "paid") {
          void refresh();
          toast.success("Pago confirmado: la carga entró al viaje");
          return;
        }
      }
      if (!cancelled && tries > 0) timer = setTimeout(() => void attempt(tries - 1), 2500);
    };
    void attempt(10);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh() se redeclara por render; las keys de la query son estables por tripId.
  }, [reviewKey, tripId, qc]);
  const decide = async (id: string, accept: boolean, amount?: number) => {
    setBusy(id);
    const { error } = await supabase.rpc("decide_package_request", {
      p_id: id,
      p_accept: accept,
      ...(amount ? { p_amount: amount } : {}),
    });
    if (!error) {
      if (accept) {
        onAccepted();
        void notify({ data: { requestId: id } }).catch(() =>
          toast.error("Se aceptó pero no se pudo avisar al solicitante"),
        );
      }
      await refresh();
      setAccepting(null);
      toast.success(
        accept ? "Pedido aceptado. Se avisó al solicitante para que pague." : "Pedido rechazado",
      );
    } else
      toast.error(error.message || "No se pudo revisar el pedido. Actualiza e intenta de nuevo.");
    setBusy(null);
  };
  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(path, 120);
    if (error || !data) return void toast.error("No se pudo abrir el comprobante");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  // En "Todas" las pendientes van primero (sort estable: conserva el orden por fecha).
  const list = data
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  // Resumen sobre todas las solicitudes (no la lista filtrada): amount_usd es
  // el neto del conductor; el solicitante paga amount_usd + 25% de servicio.
  const ganado = data
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);
  const porConfirmar = data
    .filter((r) => r.status === "awaiting_payment" || r.status === "payment_review")
    .reduce((sum, r) => sum + Number(r.amount_usd ?? 0), 0);
  return (
    <section className="mt-10 border-t border-border pt-6" aria-label="Solicitudes de recogida">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Package /> Solicitudes de recogida{" "}
          <span className="text-primary">
            ({data.filter((r) => r.status === "pending").length})
          </span>
        </h2>
        <select
          aria-label="Estado de solicitudes"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {(ganado > 0 || porConfirmar > 0) && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-xs uppercase text-muted-foreground">Ganado en este viaje</p>
          <p className="mt-1 text-2xl font-bold">${formatUsd(ganado)} USD</p>
          {porConfirmar > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              +${formatUsd(porConfirmar)} por confirmar
            </p>
          )}
        </div>
      )}
      {isLoading && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <RequestCardSkeleton key={i} />
          ))}
        </div>
      )}
      {isError && (
        <p className="mt-4 text-destructive">No se pudieron consultar las solicitudes.</p>
      )}
      {!isLoading && !isError && list.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          No hay solicitudes{" "}
          {filter === "all"
            ? ""
            : `en estado "${FILTERS.find(([v]) => v === filter)?.[1].toLowerCase()}"`}
          .
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {list.map((r) => {
          const raw = r.package as unknown;
          const pkgs = (Array.isArray(raw) ? raw : [raw]) as (Pkg & { pickup?: string })[];
          const overflow =
            r.status === "pending" &&
            packCargo(container, [...packages, ...pkgs]).unplaced.length > 0;
          return (
            <article key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex justify-between gap-3">
                <h3 className="break-words font-bold">
                  {pkgs[0]?.name}
                  {pkgs.length > 1 ? ` +${pkgs.length - 1}` : ""} ·{" "}
                  {pkgs.reduce((sum, p) => sum + p.qty, 0)} bulto(s)
                </h3>
                <span className="text-sm text-muted-foreground">
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {pkgs.map((p, i) => (
                  <li key={p.id ?? i}>
                    {pkgs.length > 1 ? `${p.name}: ` : ""}
                    {p.qty} × {p.length} × {p.width} × {p.height} cm · {p.weight} kg c/u
                    {p.fragile ? " · Frágil" : ""}
                  </li>
                ))}
              </ul>
              {r.amount_usd != null && (
                <p className="mt-1 font-mono text-sm font-semibold">
                  ${formatUsd(r.amount_usd)} USD{" "}
                  <span className="font-normal text-muted-foreground">· para ti</span>
                </p>
              )}
              <p className="mt-3 flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="break-words">
                  <strong>Recoger:</strong> {r.pickup_address}
                  <br />
                  <strong>Entregar:</strong> {r.delivery_address}
                </span>
              </p>
              {pkgs.some((p) => p.deadline) && (
                <p className="mt-2 text-sm">
                  {pkgs
                    .filter((p) => p.deadline)
                    .map((p) =>
                      pkgs.length > 1
                        ? `${p.name} antes de ${p.deadline!.replace("T", " ")}`
                        : `Entregar antes de ${p.deadline!.replace("T", " ")}`,
                    )
                    .join(" · ")}
                </p>
              )}
              <p className="mt-2 break-words text-sm">
                {r.sender_name} ·{" "}
                <a
                  className="text-primary underline"
                  href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                >
                  {r.phone}
                </a>
                {r.email ? ` · ${r.email}` : ""}
              </p>
              {r.notes && (
                <p className="mt-2 break-words text-sm text-muted-foreground">{r.notes}</p>
              )}
              {overflow && (
                <p className="mt-3 text-sm text-destructive">
                  Hay bultos que no caben con esta solicitud. Revisa la carga antes de salir.
                </p>
              )}
              {r.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <Button disabled={busy !== null} onClick={() => setAccepting(r)}>
                    <Check /> Aceptar
                  </Button>
                  <Button
                    disabled={busy !== null}
                    variant="outline"
                    onClick={() => decide(r.id, false)}
                  >
                    <X /> Rechazar
                  </Button>
                </div>
              )}
              {r.proof_path && (
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={() => viewProof(r.proof_path!)}>
                    <FileImage /> Ver comprobante
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <AcceptDialog
        request={accepting}
        routeKm={routeKm}
        busy={busy !== null}
        onClose={() => setAccepting(null)}
        onConfirm={(amount) => accepting && decide(accepting.id, true, amount)}
      />
    </section>
  );
}

function RequestCardSkeleton() {
  return (
    <article className="rounded-lg border border-border bg-card p-4" aria-hidden="true">
      <div className="flex justify-between gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="mt-2 h-4 w-56 max-w-full" />
      <Skeleton className="mt-1 h-4 w-44 max-w-full" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-2/3" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </article>
  );
}

function AcceptDialog({
  request,
  routeKm,
  busy,
  onClose,
  onConfirm,
}: {
  request: RequestRow | null;
  routeKm?: number | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const touched = useRef(false);
  // Referencia de precio: volumen del pedido × km de ruta × $0.05 (mín. $3).
  // Orienta al conductor sin obligarlo: el campo queda editable.
  const suggest = useMemo(() => {
    if (!request) return { m3: 0, kg: 0, usd: null as number | null };
    const raw = request.package as unknown;
    const pkgs = (Array.isArray(raw) ? raw : [raw]) as Pkg[];
    const m3 =
      Math.round(
        pkgs.reduce((s, p) => s + ((p.length * p.width * p.height) / 1e6) * p.qty, 0) * 100,
      ) / 100;
    const kg = pkgs.reduce((s, p) => s + p.weight * p.qty, 0);
    const usd = routeKm && m3 > 0 ? Math.max(3, Math.round(m3 * routeKm * 0.05)) : null;
    return { m3, kg, usd };
  }, [request, routeKm]);
  useEffect(() => {
    touched.current = false;
    if (request && suggest.usd !== null) setAmount(String(suggest.usd));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sugerir al abrir; si el conductor editó, no pisar.
  }, [request]);
  useEffect(() => {
    if (!touched.current && suggest.usd !== null) setAmount(String(suggest.usd));
  }, [suggest.usd]);
  const { data: rate } = useQuery({
    queryKey: ["bcv-rate"],
    staleTime: 5 * 60 * 1000,
    enabled: request !== null,
    queryFn: () => getExchangeRate(),
  });
  const usd = Number(amount);
  const valid = Number.isFinite(usd) && usd > 0 && usd <= 1000000;
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAmount("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceptar solicitud</DialogTitle>
        </DialogHeader>
        {request && (
          <>
            <p className="text-sm text-muted-foreground">
              {valid
                ? `El solicitante paga $${formatUsd(clientTotalUsd(usd) ?? usd)} por pago móvil (tu monto + 25% de servicio). La carga entra al viaje cuando el pago se confirme.`
                : "El solicitante paga tu monto + 25% de servicio por pago móvil. La carga entra al viaje cuando el pago se confirme."}
            </p>
            <div>
              <Label htmlFor="accept-amount">Monto (USD)</Label>
              <Input
                id="accept-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => {
                  touched.current = true;
                  setAmount(e.target.value);
                }}
                placeholder="Ej. 25"
                autoFocus
              />
              {(suggest.m3 > 0 || suggest.kg > 0) && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  La carga ocupa ≈ {suggest.m3} m³ · {suggest.kg} kg
                  {suggest.usd !== null &&
                    ` · referencia $${suggest.usd} (≈ ${suggest.m3} m³ × ${routeKm} km)`}
                </p>
              )}
              {valid && rate && (
                <p className="mt-2 font-mono text-sm text-muted-foreground">
                  el solicitante paga ≈ Bs {formatBs(usd * 1.25 * rate.rate)}{" "}
                  <span className="text-xs">(tasa BCV {formatBs(rate.rate)})</span>
                </p>
              )}
              {valid && !rate && <Skeleton className="mt-2 h-4 w-56" />}
            </div>
            <Button disabled={!valid || busy} onClick={() => onConfirm(usd)}>
              <Check /> Aceptar por ${valid ? formatUsd(usd) : "…"} USD
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
