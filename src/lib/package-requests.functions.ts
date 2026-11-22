import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';
import { requestSchema, type SharedTrip } from './package-request';

// Capability-only RPCs expose route details and accept submissions, never private rows.
function publicClient(url: string | undefined, key: string | undefined) {
  if (!key || !url) throw new Error('Servicio no disponible');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
      headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } },
  });
}
export const getSharedTrip = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: trip, error } = await publicClient(process.env['SUPABASE_URL'], process.env['SUPABASE_PUBLISHABLE_KEY']).rpc('shared_trip', { p_token: data.token });
    if (error) throw new Error('No se pudo consultar el viaje');
    return trip as SharedTrip | null;
  });
export const submitPackageRequest = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await publicClient(process.env['SUPABASE_URL'], process.env['SUPABASE_PUBLISHABLE_KEY']).rpc('submit_package_request', {
      p_token: data.token, p_sender: data.sender, p_phone: data.phone,
      p_pickup: data.pickup, p_delivery: data.delivery, p_package: data.package, p_notes: data.notes,
    });
    if (error) throw new Error('No se pudo enviar. Revisa los datos y que el enlace siga abierto.');
    return { sent: true };
  });
