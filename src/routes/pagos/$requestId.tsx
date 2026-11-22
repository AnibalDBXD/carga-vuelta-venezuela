import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  Upload,
  XCircle,
} from "lucide-react";
import { getPaymentSummary, getProofUploadUrl } from "@/lib/payments.functions";
import { rememberRequest } from "@/lib/my-requests";
import { supabase } from "@/integrations/supabase/client";
import { cityName, VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";
import { bankName, formatBs, formatUsd, pagoMovilQrPayload } from "@/lib/pago-movil";
import type { PaymentSummary } from "@/lib/package-request";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Summary = PaymentSummary & {
  amount_bs: number | null;
  bcv_rate: number | null;
  bcv_fetched_at: string | null;
};
const summaryQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["payment-summary", requestId],
    queryFn: () => getPaymentSummary({ data: { requestId } }) as Promise<Summary | null>,
    staleTime: 0,
  });

export const Route = createFileRoute("/pagos/$requestId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(summaryQuery(params.requestId)),
  head: () => ({
    meta: [
      { title: "Pago de tu carga — CargaRuta" },
      {
        name: "description",
        content: "Paga por pago móvil el espacio que el conductor te aceptó.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">No se pudo abrir este pago</h1>
      <p className="mt-3 text-muted-foreground">
        Comprueba el enlace o vuelve a intentarlo más tarde.
      </p>
    </main>
  ),
  pendingComponent: PaymentPageSkeleton,
  component: PaymentPage,
});

function PaymentPageSkeleton() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10" aria-hidden="true">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        <Skeleton className="mt-1 h-4 w-56 max-w-full" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-3 h-6 w-44" />
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-5 md:col-span-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          <div className="mt-4 divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="flex flex-col items-center rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-[204px] w-[204px]" />
            <Skeleton className="mt-3 h-3 w-48" />
          </div>
          <div className="mt-6 rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-2 h-4 w-56 max-w-full" />
            <Skeleton className="mt-3 h-9 w-full" />
            <Skeleton className="mt-4 h-9 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

function PaymentPage() {
  const { requestId } = Route.useParams();
  const { data: summary } = useSuspenseQuery(summaryQuery(requestId));
  const qc = useQueryClient();
  // Quien abre el enlace (propio o llegado por correo) queda registrado en
  // "Mis pagos" de este dispositivo.
  useEffect(() => {
    rememberRequest(requestId);
  }, [requestId]);
  // Mientras espera verificación, confirm_payment decide (simulación) e invalida el resumen.
  const review = useQuery({
    queryKey: ["payment-confirm", requestId],
    enabled: summary?.status === "payment_review",
    refetchInterval: 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("confirm_payment", { p_request: requestId });
      if (error) throw error;
      return data as string;
    },
  });
  useEffect(() => {
    if (review.data && review.data !== "payment_review")
      void qc.invalidateQueries({ queryKey: ["payment-summary", requestId] });
  }, [review.data, qc, requestId]);

  if (!summary)
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Pago no encontrado</h1>
        <p className="mt-3 text-muted-foreground">
          Este enlace no corresponde a ninguna solicitud.
        </p>
      </main>
    );
  const s = summary;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="flex items-center gap-2 font-mono text-xs uppercase text-primary">
        <CreditCard className="h-4 w-4" /> Pago de tu carga
      </p>
      <h1
        className="mt-2 text-4xl font-bold leading-[1.1] tracking-[-0.02em]"
        style={{ viewTransitionName: "page-title" }}
      >
        {cityName(s.origin)} → {cityName(s.destination)}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {s.departure_date}
        {s.vehicle_kind
          ? ` · ${VEHICLE_PRESETS[s.vehicle_kind as VehicleKind]?.label ?? s.vehicle_kind}`
          : ""}{" "}
        · Para {s.sender_name}
      </p>

      <section
        className="mt-6 rounded-lg border border-border bg-card p-4"
        aria-label="Resumen de la carga"
      >
        <h2 className="flex items-center gap-2 font-bold">
          <Package className="h-4 w-4" /> Tu carga · {s.package.reduce((sum, p) => sum + p.qty, 0)}{" "}
          bulto(s)
        </h2>
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          {s.package.map((p) => (
            <li key={p.id}>
              {p.name} · {p.qty} × {p.length} × {p.width} × {p.height} cm · {p.weight} kg c/u
              {p.fragile ? " · Frágil" : ""}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="break-words">
            <strong>Recogida:</strong> {s.package[0]?.pickup}
            <br />
            <strong>Entrega:</strong> {s.package[0]?.recipient}
          </span>
        </p>
        {(s.total_usd ?? s.amount_usd) != null && (
          <p className="mt-3 font-mono text-lg font-bold">
            ${formatUsd(s.total_usd ?? s.amount_usd ?? 0)} USD
            {s.amount_bs != null && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                = Bs {formatBs(s.amount_bs)}
                {s.bcv_rate != null && ` (BCV ${formatBs(s.bcv_rate)})`}
              </span>
            )}
          </p>
        )}
      </section>

      {s.status === "awaiting_payment" && (
        <>
          {s.payment_expires_at && <PaymentCountdown expiresAt={s.payment_expires_at} />}
          <PaySection
            requestId={requestId}
            summary={s}
            onUploaded={() => qc.invalidateQueries({ queryKey: ["payment-summary", requestId] })}
          />
        </>
      )}
      {s.status === "payment_review" && (
        <Notice
          icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />}
          title="Verificando tu pago"
          text="Recibimos tu comprobante. En unos segundos se confirma el pago y tu carga queda montada en el viaje."
        />
      )}
      {s.status === "paid" && (
        <Notice
          icon={<CheckCircle2 className="h-10 w-10 text-primary" />}
          title="Pago confirmado"
          text="Tu carga ya está en el plan del viaje. El conductor puede ver tu comprobante y tu recogida."
        />
      )}
      {s.status === "pending" && (
        <Notice
          icon={<Loader2 className="h-10 w-10 text-muted-foreground" />}
          title="Solicitud pendiente"
          text="El conductor aún no revisa tu solicitud. Cuando la acepte, esta misma página te dejará pagar."
        />
      )}
      {s.status === "expired" && (
        <Notice
          icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
          title="Esta solicitud venció"
          text="El viaje ya salió o el plazo de pago venció sin confirmarse. Busca otro camión con espacio en la bolsa."
        />
      )}
      {s.status === "rejected" && (
        <Notice
          icon={<XCircle className="h-10 w-10 text-destructive" />}
          title="Solicitud rechazada"
          text="El conductor no pudo tomar tu carga en este viaje. Busca otro camión disponible en la bolsa."
        />
      )}
    </main>
  );
}

// Cuenta regresiva del plazo de pago (24 h desde que el conductor acepta): el
// vencimiento real lo decide el servidor; aquí solo se muestra el tiempo que
// queda para que el pagador no se confíe.
function PaymentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = Math.round((new Date(expiresAt).getTime() - now) / 60_000);
  const label =
    minutes <= 0
      ? "El plazo está por vencer o ya venció — se confirmará al actualizar."
      : minutes >= 120
        ? `Te quedan ${Math.floor(minutes / 60)} h ${minutes % 60} min para pagar`
        : `Te quedan ${minutes} min para pagar`;
  return (
    <p className="mt-6 flex items-center gap-2 font-mono text-sm text-muted-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0 text-primary" /> {label}
    </p>
  );
}

function Notice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <section className="mt-8 border-y border-border py-8" aria-live="polite">
      {icon}
      <h2 className="mt-3 text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-xl text-muted-foreground">{text}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link to="/bolsa">Ver la bolsa de viajes</Link>
      </Button>
    </section>
  );
}

function PaySection({
  requestId,
  summary,
  onUploaded,
}: {
  requestId: string;
  summary: Summary;
  onUploaded: () => void;
}) {
  const pm = summary.payment_method;
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrl = useServerFn(getProofUploadUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  if (!pm || summary.amount_bs == null)
    return (
      <section className="mt-8 border-y border-border py-8">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="mt-3 text-xl font-bold">No se pudieron cargar los datos de pago</h2>
        <p className="mt-2 text-muted-foreground">
          {pm
            ? "No se pudo consultar la tasa BCV. Intenta más tarde."
            : "Los datos de pago móvil aún no están configurados."}
        </p>
      </section>
    );

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      toast.error("Selecciona y copia el texto");
    }
  };
  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return void setError("Elige la captura del comprobante");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return void setError("El comprobante debe ser imagen (jpg, png o webp)");
    if (file.size > 5 * 1024 * 1024) return void setError("La imagen no puede pasar de 5 MB");
    setBusy(true);
    setError("");
    try {
      const { path, token } = await uploadUrl({ data: { requestId } });
      const { error: upError } = await supabase.storage
        .from("payment-proofs")
        .uploadToSignedUrl(path, token, file);
      if (upError) throw upError;
      const { error: proofError } = await supabase.rpc("submit_payment_proof", {
        p_request: requestId,
        p_path: path,
      });
      if (proofError) throw proofError;
      onUploaded();
    } catch {
      setError("No se pudo enviar el comprobante. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    ["Banco", `${pm.bank} · ${bankName(pm.bank)}`],
    ["Teléfono", pm.phone],
    ["Cédula / RIF", pm.document],
    ["Titular", pm.holder],
    ["Monto", `Bs ${formatBs(summary.amount_bs)}`],
  ];
  return (
    <div className="mt-8 grid gap-8 md:grid-cols-5">
      <section
        className="rounded-lg border border-border bg-card p-5 md:col-span-3"
        aria-label="Datos de pago móvil"
      >
        <h2 className="text-xl font-bold">Paga por pago móvil</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transfiere <strong>Bs {formatBs(summary.amount_bs)}</strong> ($
          {formatUsd(summary.total_usd ?? summary.amount_usd ?? 0)} USD a tasa BCV) a:
        </p>
        <dl className="mt-4 divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="flex items-center gap-2 font-mono text-sm font-semibold">
                <span className="break-all text-right">{value}</span>
                <button
                  type="button"
                  aria-label={`Copiar ${label}`}
                  onClick={() => copy(label, value.replace(/^.*? · /, ""))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copied === label ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="md:col-span-2">
        <section className="flex flex-col items-center rounded-lg border border-border bg-card p-5">
          <div className="rounded-md bg-white p-3">
            <QRCode value={pagoMovilQrPayload(pm, summary.amount_bs)} size={180} />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Escanéalo desde tu banco o usa los datos de arriba.
          </p>
        </section>
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h3 className="font-bold">Sube tu comprobante</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Captura del pago móvil (jpg, png o webp, máx. 5 MB).
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="mt-4 w-full" disabled={busy} onClick={upload}>
            <Upload /> {busy ? "Enviando…" : "Enviar comprobante"}
          </Button>
        </section>
      </div>
    </div>
  );
}
