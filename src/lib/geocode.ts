// Geocoding v6 (free tier 100k req/mes, uso temporal: nada se persiste).
// Llamadas desde el navegador con el token público VITE_MAPBOX_TOKEN.

export type GeocodeResult = { label: string; lng: number; lat: number };

type Feature = {
  properties?: {
    full_address?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

function labelOf(f: Feature): string | null {
  const p = f.properties;
  return (
    p?.full_address ??
    [p?.name_preferred ?? p?.name, p?.place_formatted].filter(Boolean).join(", ") ??
    null
  );
}

/** Búsqueda de lugares en Venezuela. Devuelve [] si no hay token o falla la red. */
export async function searchPlaces(query: string, token: string): Promise<GeocodeResult[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.search = new URLSearchParams({
    access_token: token,
    q: query.trim(),
    country: "ve",
    language: "es",
    limit: "5",
    types: "address,street,place,locality,neighborhood",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: Feature[] };
  return (json.features ?? [])
    .map((f) => {
      const label = labelOf(f);
      const center = f.geometry?.coordinates;
      return label && center ? { label, lng: center[0], lat: center[1] } : null;
    })
    .filter((r): r is GeocodeResult => r !== null);
}

/** Reverse geocoding de un punto del mapa → dirección legible. null si falla. */
export async function reversePlace(
  lng: number,
  lat: number,
  token: string,
): Promise<string | null> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.search = new URLSearchParams({
    access_token: token,
    longitude: String(lng),
    latitude: String(lat),
    language: "es",
    limit: "1",
    types: "address,street,place,locality,neighborhood",
  }).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Feature[] };
    return labelOf(json.features?.[0] ?? {});
  } catch {
    return null;
  }
}
