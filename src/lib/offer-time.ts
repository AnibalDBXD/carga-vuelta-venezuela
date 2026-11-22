// Salida estimada de una oferta de la bolsa: available_date + available_time en
// hora de Venezuela (UTC-4 fijo, sin DST), igual que el guard del RPC
// submit_offer_request (AT TIME ZONE 'America/Caracas').

type OfferTimes = {
  available_date: string;
  available_time: string | null;
};

const VET_OFFSET = "-04:00";

export function offerDepartureAt(o: OfferTimes): Date {
  return new Date(`${o.available_date}T${o.available_time ?? "23:59:59"}${VET_OFFSET}`);
}

export function offerDeparted(o: OfferTimes, now: Date = new Date()): boolean {
  return offerDepartureAt(o).getTime() <= now.getTime();
}

// Escala fija de urgencia: la barra va llena cuando faltan ~20 h o más y llega
// a 0 a la hora de salida (1 h restante ≈ 5%, ya en rojo).
export const OFFER_BAR_FULL_MS = 20 * 60 * 60 * 1000;
export function offerProgress(o: OfferTimes, now: Date = new Date()): number {
  const remaining = offerDepartureAt(o).getTime() - now.getTime();
  return Math.min(1, Math.max(0, remaining / OFFER_BAR_FULL_MS));
}
