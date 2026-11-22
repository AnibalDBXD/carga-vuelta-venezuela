import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { CITIES, estimateRoute } from "./venezuela";
import { fetchDirections, geocodePoint, parseMapPoint } from "./mapbox";
import {
  corridorProjection,
  orderStops,
  type LineString,
  type LngLat,
  type RouteStop,
} from "./route-geometry";

export type RouteStopInput = {
  requestId: string;
  kind: "pickup" | "delivery";
  address: string;
};

export type TripRoute = {
  km: number;
  hours: number;
  via: string;
  checkpoints: number;
  tolls: number;
  geometry: LineString | null;
  steps: { instruction: string; km: number }[];
  stops: RouteStop[];
  source: "mapbox" | "estimate";
};

const stopSchema = z.object({
  requestId: z.string().min(1).max(64),
  kind: z.enum(["pickup", "delivery"]),
  address: z.string().min(1).max(500),
});

// Radio del corredor: un punto geocodificado más lejos se descarta, para que
// una dirección de texto libre mal resuelta no arrastre la ruta a otro estado.
const CORRIDOR_KM = 60;
const CORRIDOR_T = 0.2;

async function resolveStops(
  originId: string,
  destinationId: string,
  input: RouteStopInput[],
): Promise<RouteStop[]> {
  const a = CITIES.find((c) => c.id === originId);
  const b = CITIES.find((c) => c.id === destinationId);
  if (!a || !b || input.length === 0) return [];
  const origin: LngLat = [a.lng, a.lat];
  const dest: LngLat = [b.lng, b.lat];
  const resolved = await Promise.all(
    input.map(async (s) => {
      const point = parseMapPoint(s.address) ?? (await geocodePoint(s.address));
      if (!point) return null;
      const { t, dKm } = corridorProjection(origin, dest, point);
      if (t < -CORRIDOR_T || t > 1 + CORRIDOR_T || dKm > CORRIDOR_KM) return null;
      return {
        requestId: s.requestId,
        kind: s.kind,
        lng: point[0],
        lat: point[1],
        label: s.address,
      };
    }),
  );
  return orderStops(
    origin,
    dest,
    resolved.filter((s): s is RouteStop => s !== null),
  );
}

// Ruta real por carretera (Directions API, cacheada 12 h en servidor). Si hay
// paradas de carga/descarga se resuelven sus direcciones y la ruta pasa por
// ellas en orden de corredor. Sin Mapbox devuelve la estimación local.
export const getTripRoute = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        origin: z.string().min(1),
        destination: z.string().min(1),
        stops: z.array(stopSchema).max(46).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<TripRoute | null> => {
    const estimate = estimateRoute(data.origin, data.destination);
    if (!estimate) return null;
    const stops = await resolveStops(data.origin, data.destination, data.stops ?? []);
    const real = await fetchDirections(
      data.origin,
      data.destination,
      stops.map((s): LngLat => [s.lng, s.lat]),
    );
    if (!real) return { ...estimate, geometry: null, steps: [], stops, source: "estimate" };
    return {
      km: real.km,
      hours: real.hours,
      via: estimate.via,
      checkpoints: Math.max(1, Math.round(real.km / 70)),
      tolls: Math.max(0, Math.round(real.km / 120)),
      geometry: real.geometry,
      steps: real.steps,
      stops,
      source: "mapbox",
    };
  });

/** La estimación local con la misma forma que TripRoute (fallback mientras carga o sin Mapbox). */
export const estimateAsTripRoute = (origin: string, destination: string): TripRoute | null => {
  const e = estimateRoute(origin, destination);
  return e && { ...e, geometry: null, steps: [], stops: [], source: "estimate" };
};

export const tripRouteQuery = (origin: string, destination: string, stops: RouteStopInput[] = []) =>
  queryOptions({
    queryKey: ["trip-route", origin, destination, stops],
    queryFn: () => getTripRoute({ data: { origin, destination, stops } }),
    staleTime: 6 * 60 * 60 * 1000,
    enabled: origin !== destination && origin !== "" && destination !== "",
  });
