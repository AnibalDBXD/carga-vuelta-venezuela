// Directions API solo desde el servidor (patrón bcv.ts). El ToS de Mapbox solo
// permite cache temporal: TTL de 12 h en memoria, sin persistencia en DB.
import { CITIES } from "./venezuela";
import {
  encodePolyline,
  simplifyToMaxPoints,
  type LineString,
  type LngLat,
} from "./route-geometry";

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: DirectionsRoute }>();
const pending = new Map<string, Promise<DirectionsRoute | null>>();
const geoCache = new Map<string, { at: number; data: LngLat | null }>();
const geoPending = new Map<string, Promise<LngLat | null>>();

export type RouteStep = { instruction: string; km: number };
export type DirectionsRoute = {
  km: number;
  hours: number;
  geometry: LineString;
  steps: RouteStep[];
};

export function parseDirections(json: unknown): DirectionsRoute | null {
  const route = (json as { routes?: unknown[] } | null)?.routes?.[0] as
    | {
        distance?: unknown;
        duration?: unknown;
        geometry?: { type?: unknown; coordinates?: unknown };
        legs?: { steps?: { distance?: unknown; maneuver?: { instruction?: unknown } }[] }[];
      }
    | undefined;
  const geometry = route?.geometry;
  if (
    !route ||
    typeof route.distance !== "number" ||
    typeof route.duration !== "number" ||
    geometry?.type !== "LineString" ||
    !Array.isArray(geometry.coordinates)
  )
    return null;
  const steps: RouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      const instruction = s.maneuver?.instruction;
      if (typeof instruction === "string" && instruction)
        steps.push({
          instruction,
          km: Math.round(((typeof s.distance === "number" ? s.distance : 0) / 1000) * 10) / 10,
        });
    }
  }
  return {
    km: Math.round(route.distance / 100) / 10,
    hours: Math.round((route.duration / 3600) * 10) / 10,
    geometry: {
      type: "LineString",
      coordinates: geometry.coordinates as LineString["coordinates"],
    },
    steps,
  };
}

function token(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env["MAPBOX_TOKEN"] || process.env["VITE_MAPBOX_TOKEN"] || undefined;
}

/**
 * URL de Static Images API (free tier 50k/mes): estilo dark con la ruta dibujada
 * y pins en los extremos. Función pura — la llamada la hace el navegador.
 */
export function staticRouteMapUrl(
  geometry: LineString,
  token: string,
  width = 900,
  height = 480,
): string | null {
  const coords = geometry.coordinates;
  if (coords.length < 2) return null;
  const simplified = simplifyToMaxPoints(coords, 80);
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const overlays = [
    `path-4+ecc813-0.9(${encodePolyline(simplified)})`,
    `pin-s+ecc813(${first[0]},${first[1]})`,
    `pin-s+f4f4ec(${last[0]},${last[1]})`,
  ].join(",");
  // attribution/logo van fuera: la atribución se dibuja como texto en la imagen destino.
  const url = new URL(
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${encodeURIComponent(overlays)}/auto/${width}x${height}@2x`,
  );
  url.search = new URLSearchParams({
    access_token: token,
    padding: "50",
    attribution: "false",
    logo: "false",
  }).toString();
  return url.toString();
}

/**
 * Coordenadas del fallback "Punto en el mapa <lat>, <lng>" que escribe
 * AddressField cuando se escoge un punto en el mapa sin dirección. Es dato
 * del usuario (pin), no resultado de geocoding: se puede reusar sin límite.
 */
export function parseMapPoint(address: string): LngLat | null {
  const m = /Punto en el mapa\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(address);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lng, lat] : null;
}

/**
 * Geocoding v6 (1 resultado) desde el servidor para direcciones de texto.
 * Cache de 12 h en memoria — uso temporal, nada se persiste (como Directions).
 */
export async function geocodePoint(address: string): Promise<LngLat | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const inflight = geoPending.get(key);
  if (inflight) return inflight;
  const tok = token();
  if (!tok) return hit?.data ?? null;
  const request = (async () => {
    try {
      const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
      url.search = new URLSearchParams({
        access_token: tok,
        q: key,
        country: "ve",
        language: "es",
        limit: "1",
        types: "address,street,place,locality,neighborhood",
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`geocode ${res.status}`);
      const json = (await res.json()) as {
        features?: { geometry?: { coordinates?: [number, number] } }[];
      };
      const c = json.features?.[0]?.geometry?.coordinates;
      const point: LngLat | null = Array.isArray(c) ? [c[0], c[1]] : null;
      geoCache.set(key, { at: Date.now(), data: point });
      return point;
    } catch {
      return hit?.data ?? null;
    } finally {
      geoPending.delete(key);
    }
  })();
  geoPending.set(key, request);
  return request;
}

/** Ruta por carretera entre dos ciudades con paradas opcionales. null si no hay token, falla la red o no hay ruta. */
export async function fetchDirections(
  fromId: string,
  toId: string,
  via: LngLat[] = [],
): Promise<DirectionsRoute | null> {
  const a = CITIES.find((c) => c.id === fromId);
  const b = CITIES.find((c) => c.id === toId);
  if (!a || !b || a.id === b.id) return null;
  // Directions acepta hasta 25 coordenadas: origen + 23 paradas + destino.
  const coords: LngLat[] = [[a.lng, a.lat], ...via.slice(0, 23), [b.lng, b.lat]];
  const waypoints = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const key = `${a.id}|${b.id}|${waypoints}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const tok = token();
  if (!tok) return hit?.data ?? null;
  const request = (async () => {
    try {
      const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}`);
      url.search = new URLSearchParams({
        access_token: tok,
        geometries: "geojson",
        overview: "full",
        steps: "true",
        language: "es",
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`directions ${res.status}`);
      const route = parseDirections(await res.json());
      if (route) cache.set(key, { at: Date.now(), data: route });
      return route ?? hit?.data ?? null;
    } catch {
      return hit?.data ?? null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request;
}
