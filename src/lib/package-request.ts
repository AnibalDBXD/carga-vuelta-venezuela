import { z } from "zod";
import type { Pkg } from "./packing";

const requestBody = z.object({
  sender: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().toLowerCase().email().max(254),
  pickup: z.string().trim().min(5).max(500),
  delivery: z.string().trim().min(5).max(500),
  notes: z.string().max(2000),
  packages: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(200),
        length: z.number().positive().max(10000),
        width: z.number().positive().max(10000),
        height: z.number().positive().max(10000),
        weight: z.number().positive().max(10000),
        qty: z.number().int().min(1).max(100),
        fragile: z.boolean(),
        deadline: z
          .string()
          .refine(
            (v) =>
              v === "" ||
              (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && Number.isFinite(new Date(v).getTime())),
            "Plazo inválido",
          ),
      }),
    )
    .min(1)
    .max(50),
});
export const offerRequestSchema = requestBody.extend({ offerId: z.string().uuid() });
export type PackageRequestBody = z.infer<typeof requestBody>;
export type OfferRequestInput = z.infer<typeof offerRequestSchema>;
export type SharedTrip = {
  origin: string;
  destination: string;
  departure_date: string;
  vehicle_kind: string | null;
  active: boolean;
  offer_id: string | null;
};
export type RequestStatus =
  "pending" | "awaiting_payment" | "payment_review" | "paid" | "rejected" | "expired";
// Comisión de la plataforma: el solicitante paga amount_usd * (1 + PLATFORM_FEE).
export const PLATFORM_FEE = 0.25;
// Lo que paga el cliente: total_usd congelado en la fila o amount_usd × 1.25.
export const clientTotalUsd = (amountUsd: number | null, totalUsd?: number | null) =>
  totalUsd ?? (amountUsd == null ? null : Math.round(amountUsd * (1 + PLATFORM_FEE) * 100) / 100);
export type RequestPaymentMethod = {
  bank: string;
  phone: string;
  document: string;
  holder: string;
};
export type PaymentSummary = {
  origin: string;
  destination: string;
  departure_date: string;
  vehicle_kind: string | null;
  package: (Pkg & { pickup?: string; recipient?: string })[];
  sender_name: string;
  amount_usd: number | null;
  total_usd: number | null;
  status: RequestStatus;
  has_proof: boolean;
  payment_expires_at: string | null;
  payment_method: RequestPaymentMethod | null;
};
export type PublicOffer = {
  id: string;
  origin: string;
  destination: string;
  available_date: string;
  available_time: string | null;
  vehicle_kind: string;
  free_m3: number;
  free_kg: number;
  driver_name: string;
  notes: string | null;
  created_at: string;
};
export const PUBLIC_OFFER_COLUMNS =
  "id,origin,destination,available_date,available_time,vehicle_kind,free_m3,free_kg,driver_name,notes,created_at";
