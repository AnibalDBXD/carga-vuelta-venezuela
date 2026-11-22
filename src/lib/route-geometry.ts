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
