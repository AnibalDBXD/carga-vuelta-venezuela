import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Share2, X, Package, MapPin, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cityName } from '@/lib/venezuela';
import { packCargo, type Container, type Pkg } from '@/lib/packing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Trip = { id: string; origin: string; destination: string; departure_date: string };
export function ShareTrip({ trip }: { trip: Trip }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const { data: share } = useQuery({ queryKey: ['trip-share', trip.id], queryFn: async () => {
    const { data, error } = await supabase.from('trip_shares').select('*').eq('trip_id', trip.id).maybeSingle();
    if (error) throw error;
    return data;
  } });
  const prepare = async () => {
    setBusy(true);
    try {
      let token = share?.id;
      if (!token) {
        const { data, error } = await supabase.from('trip_shares').upsert({ trip_id: trip.id }, { onConflict: 'trip_id' }).select('id').single();
        if (error || !data) throw new Error();
        token = data.id;
      }
      setUrl(`${window.location.origin}/recogidas/${token}`);
      await qc.invalidateQueries({ queryKey: ['trip-share', trip.id] });
    } catch { toast.error('No se pudo crear el enlace'); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    if (!share) return;
    setBusy(true);
    const { error } = await supabase.from('trip_shares').update({ active: !share.active }).eq('id', share.id);
    setBusy(false);
    if (error) return void toast.error('No se pudo cambiar la disponibilidad');
    await qc.invalidateQueries({ queryKey: ['trip-share', trip.id] });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Enlace copiado'); }
    catch { toast.error('Selecciona y copia el enlace'); }
  };
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) void prepare(); }}>
    <DialogTrigger asChild><Button variant="outline"><Share2 /> Compartir regreso</Button></DialogTrigger>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Recibir paquetes para el regreso</DialogTitle></DialogHeader>
      <p className="font-semibold">{cityName(trip.origin)} → {cityName(trip.destination)} · {trip.departure_date}</p>
      <Label htmlFor={`share-${trip.id}`}>Enlace de solicitudes</Label>
      <Input id={`share-${trip.id}`} readOnly value={url} onFocus={e => e.target.select()} />
      <p className="text-sm text-muted-foreground">{share?.active === false ? 'Solicitudes cerradas' : 'Solicitudes abiertas'} · Los pedidos quedan pendientes hasta que los aceptes.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !url} onClick={copy}><Copy /> Copiar enlace</Button>
        <Button asChild variant="outline" disabled={!url}><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Tengo espacio para carga ${cityName(trip.origin)} → ${cityName(trip.destination)} el ${trip.departure_date}. Solicita una recogida: ${url}`)}`}><MessageCircle /> WhatsApp</a></Button>
        {share && <Button variant="ghost" disabled={busy} onClick={toggle}>{share.active ? 'Cerrar solicitudes' : 'Reabrir solicitudes'}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}

export function TripRequests({ tripId, packages, container, onAccepted }: { tripId: string; packages: Pkg[]; container: Container; onAccepted: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('pending');
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['package-requests', tripId], refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.from('package_requests').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } });
  const decide = async (id: string, accept: boolean) => {
    setBusy(id);
    const { error } = await supabase.rpc('decide_package_request', { p_id: id, p_accept: accept });
    if (!error) {
      if (accept) onAccepted();
      await Promise.all([qc.invalidateQueries({ queryKey: ['package-requests', tripId] }), qc.invalidateQueries({ queryKey: ['trip', tripId] }), qc.invalidateQueries({ queryKey: ['trips'] })]);
      toast.success(accept ? 'Pedido aceptado y añadido a la carga' : 'Pedido rechazado');
    } else toast.error('No se pudo revisar el pedido. Actualiza e intenta de nuevo.');
    setBusy(null);
  };
  const list = data.filter(r => filter === 'all' || r.status === filter);
  return <section className="mt-10 border-t border-border pt-6" aria-label="Solicitudes de recogida">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Package /> Solicitudes de recogida <span className="text-primary">({data.filter(r => r.status === 'pending').length})</span></h2>
      <select aria-label="Estado de solicitudes" value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="pending">Pendientes</option><option value="accepted">Aceptadas</option><option value="rejected">Rechazadas</option><option value="all">Todas</option>
      </select>
    </div>
    {isLoading && <p className="mt-4 text-muted-foreground">Cargando solicitudes…</p>}
    {isError && <p className="mt-4 text-destructive">No se pudieron consultar las solicitudes.</p>}
    {!isLoading && !isError && list.length === 0 && <p className="mt-4 text-muted-foreground">No hay solicitudes {filter === 'all' ? '' : filter === 'pending' ? 'pendientes' : filter === 'accepted' ? 'aceptadas' : 'rechazadas'}.</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {list.map(r => {
        const pkg = r.package as unknown as Pkg & { pickup?: string };
        const overflow = r.status === 'pending' && packCargo(container, [...packages, pkg]).unplaced.length > 0;
        return <article key={r.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between gap-3"><h3 className="break-words font-bold">{pkg.name} · {pkg.qty} bulto(s)</h3><span className="text-sm text-muted-foreground">{r.status === 'pending' ? 'Pendiente' : r.status === 'accepted' ? 'Aceptada' : 'Rechazada'}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">{pkg.length} × {pkg.width} × {pkg.height} cm · {pkg.weight} kg c/u{pkg.fragile ? ' · Frágil' : ''}</p>
          <p className="mt-3 flex items-start gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" /><span className="break-words"><strong>Recoger:</strong> {r.pickup_address}<br /><strong>Entregar:</strong> {r.delivery_address}</span></p>
          {pkg.deadline && <p className="mt-2 text-sm">Entregar antes de {pkg.deadline.replace('T', ' ')}</p>}
          <p className="mt-2 break-words text-sm">{r.sender_name} · <a className="text-primary underline" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a></p>
          {r.notes && <p className="mt-2 break-words text-sm text-muted-foreground">{r.notes}</p>}
          {overflow && <p className="mt-3 text-sm text-destructive">Hay bultos que no caben con esta solicitud. Revisa la carga antes de salir.</p>}
          {r.status === 'pending' && <div className="mt-4 flex gap-2"><Button disabled={busy !== null} onClick={() => decide(r.id, true)}><Check /> Aceptar</Button><Button disabled={busy !== null} variant="outline" onClick={() => decide(r.id, false)}><X /> Rechazar</Button></div>}
        </article>;
      })}
    </div>
  </section>;
}
