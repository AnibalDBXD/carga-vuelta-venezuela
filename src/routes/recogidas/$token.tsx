import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { CheckCircle2, Package, Send, Truck } from 'lucide-react';
import { getSharedTrip, submitPackageRequest } from '@/lib/package-requests.functions';
import { cityName } from '@/lib/venezuela';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const sharedQuery = (token: string) => queryOptions({ queryKey: ['shared-trip', token], queryFn: () => getSharedTrip({ data: { token } }), staleTime: 0 });
export const Route = createFileRoute('/recogidas/$token')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(sharedQuery(params.token)),
  head: ({ loaderData }) => {
    const route = loaderData ? `${cityName(loaderData.origin)} → ${cityName(loaderData.destination)}` : 'Viaje de regreso';
    const title = `Solicitar recogida · ${route} — CargaRuta`;
    const description = `Envía los detalles de tu paquete para el viaje ${route}. El conductor revisará tu solicitud.`;
    return { meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
  },
  errorComponent: () => <main className="mx-auto max-w-2xl px-4 py-12"><h1 className="text-2xl font-bold">No se pudo abrir este enlace</h1><p className="mt-3 text-muted-foreground">Comprueba el enlace o vuelve a intentarlo más tarde.</p></main>,
  component: RequestPickup,
});
function RequestPickup() {
  const { token } = Route.useParams();
  const { data: trip } = useSuspenseQuery(sharedQuery(token));
  const send = useServerFn(submitPackageRequest);
  const [fragile, setFragile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  if (!trip || !trip.active) return <main className="mx-auto max-w-2xl px-4 py-12"><h1 className="text-2xl font-bold">{trip ? 'Solicitudes cerradas' : 'Enlace no disponible'}</h1><p className="mt-3 text-muted-foreground">Este viaje no está recibiendo nuevos pedidos de recogida.</p></main>;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const str = (key: string) => String(form.get(key) ?? '');
    setBusy(true); setError('');
    try {
      await send({ data: { token, sender: str('sender'), phone: str('phone'), pickup: str('pickup'), delivery: str('delivery'), notes: str('notes'), package: { name: str('name'), length: Number(str('length')), width: Number(str('width')), height: Number(str('height')), weight: Number(str('weight')), qty: Number(str('qty')), fragile, deadline: str('deadline') } } });
      setSent(true);
    } catch { setError('No se pudo enviar la solicitud. Revisa los datos o comprueba si el conductor cerró el enlace.'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-3xl px-4 py-10">
    <p className="flex items-center gap-2 font-mono text-xs uppercase text-primary"><Truck className="h-4 w-4" /> Carga de regreso · {trip.departure_date}</p>
    <h1 className="mt-2 text-3xl font-bold">{cityName(trip.origin)} → {cityName(trip.destination)}</h1>
    {sent ? <section className="mt-8 border-y border-border py-8" aria-live="polite"><CheckCircle2 className="h-10 w-10 text-primary" /><h2 className="mt-3 text-2xl font-bold">Solicitud enviada</h2><p className="mt-2 text-muted-foreground">Tu paquete queda pendiente de la aprobación del conductor. Puede contactarte al teléfono que indicaste.</p><Button variant="outline" className="mt-5" onClick={() => setSent(false)}>Solicitar otra recogida</Button></section> : <form onSubmit={submit} className="mt-8 space-y-7">
      <section className="space-y-4 border-t border-border pt-5"><h2 className="text-xl font-bold">Contacto</h2><div className="grid gap-4 sm:grid-cols-2"><Field name="sender" label="Tu nombre" minLength={2} maxLength={100} /><Field name="phone" label="Teléfono / WhatsApp" type="tel" minLength={7} maxLength={30} /></div></section>
      <section className="space-y-4 border-t border-border pt-5"><h2 className="text-xl font-bold">Recogida y entrega</h2><Field name="pickup" label="Dirección de recogida" minLength={5} maxLength={500} placeholder="Ciudad, sector, calle y referencia" /><Field name="delivery" label="Dirección de entrega" minLength={5} maxLength={500} placeholder="Ciudad, sector, calle y referencia" /></section>
      <section className="space-y-4 border-t border-border pt-5"><h2 className="flex items-center gap-2 text-xl font-bold"><Package /> Detalles del paquete</h2><Field name="name" label="Descripción" minLength={2} maxLength={200} placeholder="Ej. Cajas de vasos de vidrio" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><Field name="length" label="Largo (cm)" type="number" min={1} max={10000} /><Field name="width" label="Ancho (cm)" type="number" min={1} max={10000} /><Field name="height" label="Alto (cm)" type="number" min={1} max={10000} /><Field name="weight" label="Peso por bulto (kg)" type="number" min={0.01} max={10000} step="0.01" /><Field name="qty" label="Cantidad de bultos" type="number" min={1} max={100} defaultValue="1" /><div className="flex items-center gap-3"><Switch id="fragile" checked={fragile} onCheckedChange={setFragile} /><Label htmlFor="fragile">Frágil</Label></div></div><Field name="deadline" label="Entregar antes de (opcional)" type="datetime-local" required={false} /><div><Label htmlFor="notes">Notas (opcional)</Label><Textarea id="notes" name="notes" maxLength={2000} /></div></section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button size="lg" type="submit" disabled={busy}><Send /> {busy ? 'Enviando…' : 'Enviar solicitud de recogida'}</Button>
    </form>}
  </main>;
}
function Field({ name, label, ...props }: React.ComponentProps<typeof Input> & { name: string; label: string }) {
  return <div className="min-w-0"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required {...props} /></div>;
}
