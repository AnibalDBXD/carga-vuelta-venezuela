import { z } from 'zod';
import type { Pkg } from './packing';

export const requestSchema = z.object({
  token: z.string().uuid(),
  sender: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(30),
  pickup: z.string().trim().min(5).max(500),
  delivery: z.string().trim().min(5).max(500),
  notes: z.string().max(2000),
  package: z.object({
    name: z.string().trim().min(2).max(200),
    length: z.number().positive().max(10000),
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
    weight: z.number().positive().max(10000),
    qty: z.number().int().min(1).max(100),
    fragile: z.boolean(),
    deadline: z.string().refine(v => v === '' || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && Number.isFinite(new Date(v).getTime())), 'Plazo inválido'),
  }),
});
export type PackageRequestInput = z.infer<typeof requestSchema>;
export type SharedTrip = { origin: string; destination: string; departure_date: string; vehicle_kind: string | null; active: boolean };
export function requestPackage(id: string, input: PackageRequestInput): Pkg & { pickup: string } {
  return { ...input.package, id, pickup: input.pickup, recipient: input.delivery };
}
