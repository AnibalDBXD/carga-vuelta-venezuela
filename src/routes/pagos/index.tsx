import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  Package,
  Search,
  X,
} from "lucide-react";
import { getPaymentSummary, requestPaymentLinks } from "@/lib/payments.functions";
import { cityName, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { formatUsd } from "@/lib/pago-movil";
import { forgetRequest, readMyRequests } from "@/lib/my-requests";
import type { PaymentSummary, RequestStatus } from "@/lib/package-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Summary = PaymentSummary & { requestId: string };

export const Route = createFileRoute("/pagos/")({
  head: () => ({
    meta: [
      { title: "Mis pagos — CargaRuta" },
      {
        name: "description",
        content: "Revisa el estado de tus solicitudes de espacio y paga las aceptadas.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyPayments,
});

// El solicitante no tiene cuenta: los ids guardados en este dispositivo son las
// capabilities que ya le entregó el flujo (envío de solicitud o enlace por correo).
function MyPayments() {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setIds(readMyRequests());
    setLoaded(true);
  }, []);
  const { data, isError } = useQuery({
    queryKey: ["my-requests", ids],
    enabled: ids.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const summaries = await Promise.all(
        ids.map(
          (requestId) =>
            getPaymentSummary({ data: { requestId } }) as Promise<PaymentSummary | null>,
        ),
      );
      return ids
        .map((requestId, i) => (summaries[i] ? { ...summaries[i]!, requestId } : null))
        .filter((s): s is Summary => s !== null);
    },
  });
  const qc = useQueryClient();
  const remove = (id: string) => {
    forgetRequest(id);
    const rest = ids.filter((r) => r !== id);
    setIds(rest);
    void qc.invalidateQueries({ queryKey: ["my-requests", rest] });
  };
  const sorted = [...(data ?? [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">Soy cliente</p>
      <h1
        className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
        style={{ viewTransitionName: "page-title" }}
      >
        Mis pagos
      </h1>
      <p className="mt-2 text-muted-foreground">
        Tus solicitudes de espacio en este dispositivo. Cuando el conductor acepta, aquí pagas.
      </p>

      {isError ? (
        <p role="alert" className="mt-8 text-destructive">
          No se pudieron consultar tus solicitudes. Intenta de nuevo más tarde.
        </p>
      ) : !loaded || (ids.length > 0 && !data) ? (
        <div className="mt-8 space-y-4" aria-hidden="true">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-5">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="mt-2 h-4 w-40" />
              <Skeleton className="mt-3 h-4 w-64" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <section className="mt-8 border-y border-border py-8">
          <Search className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-2xl font-bold">Sin solicitudes en este dispositivo</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Cuando pidas espacio en un viaje, tu solicitud y su pago aparecen aquí. ¿La hiciste en
            otro dispositivo? Abajo recuperas tus enlaces por correo.
          </p>
          <Button asChild className="mt-5">
            <Link to="/bolsa">
              <Search /> Buscar espacio en la bolsa
            </Link>
          </Button>
        </section>
      ) : (
        <ul className="mt-8 space-y-4">
          {sorted.map((s) => (
            <RequestCard key={s.requestId} summary={s} onRemove={() => remove(s.requestId)} />
          ))}
        </ul>
      )}

      <RecoverLinks />
    </main>
  );
}

const STATUS_ORDER: Record<RequestStatus, number> = {
  awaiting_payment: 0,
  payment_review: 1,
  pending: 2,
  paid: 3,
  rejected: 4,
  expired: 5,
};

const STATUS_BADGE: Record<
  RequestStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  awaiting_payment: { label: "Por pagar", variant: "default" },
  payment_review: { label: "Verificando pago", variant: "secondary" },
  pending: { label: "Esperando al conductor", variant: "secondary" },
  paid: { label: "Pagada", variant: "outline" },
  rejected: { label: "Rechazada", variant: "destructive" },
  expired: { label: "Vencida", variant: "destructive" },
};

const TERMINAL: RequestStatus[] = ["rejected", "expired"];

// Sub-estado de una solicitud pagada según el estado real del camión.
function cargoStage(s: Summary): string {
  if (s.completed_at) return "Llegó";
  if (s.departed_at) return "En camino";
  return "Por salir";
}

function RequestCard({ summary: s, onRemove }: { summary: Summary; onRemove: () => void }) {
  const badge =
    s.status === "paid"
      ? // La pagada muestra el sub-estado del tracking, no solo "Pagada".
        { label: cargoStage(s), variant: "outline" as const }
      : STATUS_BADGE[s.status];
  const bultos = s.package.reduce((sum, p) => sum + p.qty, 0);
  const minutesLeft = s.payment_expires_at
    ? Math.round((new Date(s.payment_expires_at).getTime() - Date.now()) / 60_000)
    : null;
  return (
    <li>
      <article className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              {cityName(s.origin)} → {cityName(s.destination)}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {s.departure_date}
              {s.vehicle_kind
                ? ` · ${VEHICLE_PRESETS[s.vehicle_kind as VehicleKind]?.label ?? s.vehicle_kind}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {TERMINAL.includes(s.status) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Quitar de la lista"
                onClick={onRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4 shrink-0" />
          {bultos} bulto(s) · Para {s.sender_name}
        </p>
        {s.status === "awaiting_payment" && minutesLeft !== null && minutesLeft > 0 && (
          <p className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary" />
            {minutesLeft >= 120
              ? `Quedan ${Math.floor(minutesLeft / 60)} h ${minutesLeft % 60} min para pagar`
              : `Quedan ${minutesLeft} min para pagar`}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          {(s.total_usd ?? s.amount_usd) != null ? (
            <p className="font-mono text-lg font-bold">
              ${formatUsd(s.total_usd ?? s.amount_usd ?? 0)} USD
            </p>
          ) : (
            <span />
          )}
          <Button
            asChild
            size="sm"
            variant={s.status === "awaiting_payment" ? "default" : "outline"}
          >
            <Link to="/pagos/$requestId" params={{ requestId: s.requestId }}>
              {s.status === "awaiting_payment" ? "Pagar ahora" : "Ver detalle"}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </article>
    </li>
  );
}

// El correo llega solo al buzón del solicitante: la pantalla siempre muestra el
// mismo mensaje aunque no haya solicitudes con ese correo.
function RecoverLinks() {
  const sendLinks = useServerFn(requestPaymentLinks);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setBusy(true);
    try {
      await sendLinks({ data: { email } });
      setSent(true);
    } catch {
      toast.error("No se pudo enviar el correo. Intenta más tarde.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-10 rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Mail className="h-4 w-4" /> ¿No ves tu solicitud?
      </h2>
      {sent ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Si tienes solicitudes activas con ese correo, te enviamos los enlaces a tus páginas de
          pago. Revisa tu bandeja (y el spam).
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Escribe el correo que usaste en la solicitud y te enviamos los enlaces a tus pagos.
          </p>
          <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:min-w-64">
              <Label htmlFor="recover-email">Correo electrónico</Label>
              <Input
                id="recover-email"
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="tu@correo.com"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Mail />}
              {busy ? "Enviando…" : "Enviar enlaces"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
