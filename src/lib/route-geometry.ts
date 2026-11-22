import { CITIES, type City } from "./venezuela";

export type LngLat = [lng: number, lat: number];
export type LineString = { type: "LineString"; coordinates: LngLat[] };

// Proyección equirectangular local (misma aproximación que suggestStops): para la
// franja venezolana (~5-12° N) el error es menor a la tolerancia de parada.
function toXY([lng, lat]: LngLat, cos: number): [number, number] {
  return [lng * cos * 111.32, lat * 110.57];
}

function segmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

/**
 * Ciudades cercanas a la geometría real de una ruta (no a la línea recta),
 * ordenadas por su posición sobre la vía. Excluye los extremos del viaje.
 */
export function citiesAlongGeometry(
  line: LineString,
  fromId: string,
  toId: string,
  maxKm = 25,
  cities: City[] = CITIES,
): City[] {
  const coords = line.coordinates;
  if (coords.length < 2) return [];
  const latMid = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const cos = Math.cos((latMid * Math.PI) / 180);
  const pts = coords.map((c) => toXY(c, cos));
  return cities
    .filter((c) => c.id !== fromId && c.id !== toId)
    .map((c) => {
      const p = toXY([c.lng, c.lat], cos);
      let best = { d: Infinity, along: 0 };
      for (let i = 0; i < pts.length - 1; i++) {
        const { d, t } = segmentDistance(p, pts[i]!, pts[i + 1]!);
        if (d < best.d) best = { d, along: i + t };
      }
      return { city: c, d: best.d, along: best.along };
    })
    .filter(({ d }) => d <= maxKm)
    .sort((a, b) => a.along - b.along)
    .map(({ city }) => city);
}

/**
 * Posición de un punto sobre el eje origen→destino: `t` es la posición a lo
 * largo del corredor (0 = origen, 1 = destino, sin recortar) y `dKm` la
 * distancia perpendicular en km. Misma aproximación equirectangular de arriba.
 */
export function corridorProjection(
  from: LngLat,
  to: LngLat,
  p: LngLat,
): { t: number; dKm: number } {
  const cos = Math.cos((((from[1] + to[1]) / 2) * Math.PI) / 180);
  const a = toXY(from, cos);
  const b = toXY(to, cos);
  const q = toXY(p, cos);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2;
  return { t, dKm: Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy)) };
}

export type RouteStop = {
  requestId: string;
  kind: "pickup" | "delivery";
  lng: number;
  lat: number;
  label: string;
};

/**
 * Enlace de Google Maps (dir api) con origen, destino y las paradas ya
 * ordenadas como waypoints — el conductor lo abre para navegar. Google
 * admite hasta 9 waypoints además de los extremos.
 */
export function googleMapsDirUrl(
  origin: LngLat,
  destination: LngLat,
  stops: RouteStop[] = [],
): string {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: `${origin[1]},${origin[0]}`,
    destination: `${destination[1]},${destination[0]}`,
  });
  const via = stops.slice(0, 9);
  if (via.length > 0) params.set("waypoints", via.map((s) => `${s.lat},${s.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Ordena las paradas de carga/descarga por su posición sobre el corredor
 * origen→destino. Repara la precedencia: la entrega de una solicitud nunca
 * queda antes de su recogida (se reubica justo después de ella).
 */
export function orderStops(from: LngLat, to: LngLat, stops: RouteStop[]): RouteStop[] {
  const ordered = stops
    .map((s, i) => ({ s, i, t: corridorProjection(from, to, [s.lng, s.lat]).t }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ s }) => s);
  const pickupIndex = (id: string) =>
    ordered.findIndex((s) => s.requestId === id && s.kind === "pickup");
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]!;
    if (s.kind !== "delivery") continue;
    const p = pickupIndex(s.requestId);
    if (p === -1 || p < i) continue;
    ordered.splice(i, 1);
    ordered.splice(pickupIndex(s.requestId) + 1, 0, s);
    i--;
  }
  return ordered;
}

/** Douglas-Peucker sobre coordenadas [lng, lat]; tolerancia en grados. */
export function simplifyLine(coords: LngLat[], tolerance: number): LngLat[] {
  if (coords.length <= 2) return [...coords];
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const { d } = segmentDistance(
      [coords[i]![0], coords[i]![1]],
      [first[0], first[1]],
      [last[0], last[1]],
    );
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tolerance) return [first, last];
  return [
    ...simplifyLine(coords.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplifyLine(coords.slice(index), tolerance),
  ];
}

/** Simplifica subiendo la tolerancia hasta que quepa en `maxPoints` puntos. */
export function simplifyToMaxPoints(coords: LngLat[], maxPoints: number): LngLat[] {
  if (coords.length <= maxPoints) return [...coords];
  let tolerance = 0.001;
  for (let i = 0; i < 8; i++) {
    const out = simplifyLine(coords, tolerance);
    if (out.length <= maxPoints) return out;
    tolerance *= 4;
  }
  return simplifyLine(coords, tolerance);
}

/**
 * Codificación polyline de Google (precision 5, la que usa Mapbox Static Images).
 */
export function encodePolyline(coords: LngLat[], precision = 5): string {
  const factor = 10 ** precision;
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const chunk = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * factor);
    const ilng = Math.round(lng * factor);
    chunk(ilat - prevLat);
    chunk(ilng - prevLng);
    prevLat = ilat;
    prevLng = ilng;
  }
  return out;
}
