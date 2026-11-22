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

// Fracción de tiempo que le queda a la oferta dentro de su ventana
// (created_at → salida): 1 recién publicada, 0 al llegar la hora.
export function offerProgress(
  o: OfferTimes & { created_at: string },
  now: Date = new Date(),
): number {
  const end = offerDepartureAt(o).getTime();
  const start = new Date(o.created_at).getTime();
  if (!Number.isFinite(start) || end <= start) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
}
