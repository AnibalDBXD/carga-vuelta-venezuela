import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { estimateRoute } from "./venezuela";
import { fetchDirections } from "./mapbox";
import type { LineString } from "./route-geometry";

export type TripRoute = {
  km: number;
  hours: number;
  via: string;
  checkpoints: number;
  tolls: number;
  geometry: LineString | null;
  steps: { instruction: string; km: number }[];
  source: "mapbox" | "estimate";
};

// Ruta real por carretera (Directions API, cacheada 12 h en servidor). Si Mapbox
// no está configurado o falla, devuelve la estimación local con geometry: null.
export const getTripRoute = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ origin: z.string().min(1), destination: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<TripRoute | null> => {
    const estimate = estimateRoute(data.origin, data.destination);
    if (!estimate) return null;
    const real = await fetchDirections(data.origin, data.destination);
    if (!real) return { ...estimate, geometry: null, steps: [], source: "estimate" };
    return {
      km: real.km,
      hours: real.hours,
      via: estimate.via,
      checkpoints: Math.max(1, Math.round(real.km / 70)),
      tolls: Math.max(0, Math.round(real.km / 120)),
      geometry: real.geometry,
      steps: real.steps,
      source: "mapbox",
    };
  });

/** La estimación local con la misma forma que TripRoute (fallback mientras carga o sin Mapbox). */
export const estimateAsTripRoute = (origin: string, destination: string): TripRoute | null => {
  const e = estimateRoute(origin, destination);
  return e && { ...e, geometry: null, steps: [], source: "estimate" };
};

export const tripRouteQuery = (origin: string, destination: string) =>
  queryOptions({
    queryKey: ["trip-route", origin, destination],
    queryFn: () => getTripRoute({ data: { origin, destination } }),
    staleTime: 6 * 60 * 60 * 1000,
    enabled: origin !== destination && origin !== "" && destination !== "",
  });
