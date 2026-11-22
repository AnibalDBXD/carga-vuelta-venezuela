export type TripLike = {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  vehicle_id?: string | null;
  vehicles?: { id?: string | null } | null;
};

export type TripGroup<T extends TripLike> = {
  key: string;
  trips: T[];
  /** true solo cuando hay al menos un par con sentidos opuestos (A→B y B→A). */
  roundTrip: boolean;
};

/**
 * Agrupa viajes del mismo camión en el mismo día. Un grupo se marca como ida y
 * vuelta únicamente si incluye ambos sentidos; si no, se muestra como viajes
 * sueltos (el consumidor decide).
 */
export function groupTrips<T extends TripLike>(trips: T[]): TripGroup<T>[] {
  const groups: TripGroup<T>[] = [];
  const index = new Map<string, number>();
  for (const trip of trips) {
    const vehicleKey = trip.vehicles?.id ?? trip.vehicle_id ?? "sin-vehiculo";
    const key = `${vehicleKey}|${trip.departure_date}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push({ key, trips: [trip], roundTrip: false });
    } else {
      groups[at]!.trips.push(trip);
    }
  }
  for (const group of groups) {
    group.roundTrip =
      group.trips.length > 1 &&
      group.trips.some((a) =>
        group.trips.some((b) => b.origin === a.destination && b.destination === a.origin),
      );
  }
  return groups;
}
