export type City = { id: string; name: string; state: string; lat: number; lng: number };

export const CITIES: City[] = [
  { id: "valencia", name: "Valencia", state: "Carabobo", lat: 10.162, lng: -68.007 },
  { id: "caracas", name: "Caracas", state: "Distrito Capital", lat: 10.4806, lng: -66.9036 },
  { id: "maracay", name: "Maracay", state: "Aragua", lat: 10.2469, lng: -67.5958 },
  { id: "puerto-cabello", name: "Puerto Cabello", state: "Carabobo", lat: 10.4731, lng: -68.0125 },
  { id: "barquisimeto", name: "Barquisimeto", state: "Lara", lat: 10.0647, lng: -69.357 },
  { id: "maracaibo", name: "Maracaibo", state: "Zulia", lat: 10.6545, lng: -71.6406 },
  { id: "san-cristobal", name: "San Cristóbal", state: "Táchira", lat: 7.7669, lng: -72.225 },
  { id: "merida", name: "Mérida", state: "Mérida", lat: 8.5897, lng: -71.1561 },
  { id: "barinas", name: "Barinas", state: "Barinas", lat: 8.6226, lng: -70.2075 },
  { id: "san-carlos", name: "San Carlos", state: "Cojedes", lat: 9.6612, lng: -68.5827 },
  { id: "acarigua", name: "Acarigua", state: "Portuguesa", lat: 9.5545, lng: -69.1956 },
  { id: "san-juan", name: "San Juan de los Morros", state: "Guárico", lat: 9.9115, lng: -67.3538 },
  {
    id: "puerto-la-cruz",
    name: "Puerto La Cruz",
    state: "Anzoátegui",
    lat: 10.2167,
    lng: -64.6167,
  },
  { id: "barcelona", name: "Barcelona", state: "Anzoátegui", lat: 10.1363, lng: -64.6862 },
  { id: "cumana", name: "Cumaná", state: "Sucre", lat: 10.45, lng: -64.1667 },
  { id: "maturin", name: "Maturín", state: "Monagas", lat: 9.7457, lng: -63.1832 },
  { id: "ciudad-bolivar", name: "Ciudad Bolívar", state: "Bolívar", lat: 8.1222, lng: -63.5497 },
  { id: "puerto-ordaz", name: "Puerto Ordaz", state: "Bolívar", lat: 8.296, lng: -62.7117 },
  { id: "coro", name: "Coro", state: "Falcón", lat: 11.4045, lng: -69.6734 },
  { id: "punto-fijo", name: "Punto Fijo", state: "Falcón", lat: 11.6956, lng: -70.1997 },
];

export const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;

/** Ciudad troncal más cercana a un punto (para ajustar lugares libres del mapa a la red). */
export function nearestCity(lng: number, lat: number, cities: City[] = CITIES): City | null {
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = haversine({ id: "", name: "", state: "", lat, lng }, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Known road distances (km) and corridor notes for the most common routes from the center. */
const KNOWN: Record<string, { km: number; via: string }> = {
  "caracas|valencia": {
    km: 165,
    via: "Autopista Regional del Centro (ARC) vía Maracay, La Victoria y Tazón",
  },
  "maracay|valencia": { km: 50, via: "Autopista Regional del Centro (ARC)" },
  "puerto-cabello|valencia": {
    km: 55,
    via: "Autopista Valencia–Puerto Cabello (bajada de El Palito)",
  },
  "barquisimeto|valencia": {
    km: 190,
    via: "Autopista Centro Occidental (Cimarrón Andresote) vía Yaracuy",
  },
  "maracaibo|valencia": { km: 520, via: "Barquisimeto – Carora – Puente sobre el Lago" },
  "puerto-la-cruz|valencia": {
    km: 470,
    via: "ARC – Caracas – Autopista Gran Mariscal de Ayacucho",
  },
  "san-carlos|valencia": { km: 105, via: "Autopista José Antonio Páez (Tinaquillo)" },
  "acarigua|valencia": { km: 185, via: "Autopista José Antonio Páez" },
  "san-cristobal|valencia": { km: 680, via: "Troncal 5 vía Acarigua, Barinas y Santa Bárbara" },
  "barinas|valencia": { km: 340, via: "Autopista José Antonio Páez" },
  "coro|valencia": { km: 290, via: "Morón – Tucacas – Troncal 3" },
};

function haversine(a: City, b: City) {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type RouteEstimate = {
  km: number;
  hours: number;
  via: string;
  checkpoints: number;
  tolls: number;
};

/** Estimate a road route. Trucks average ~55 km/h in Venezuela counting alcabalas and road state. */
export function estimateRoute(fromId: string, toId: string): RouteEstimate | null {
  const a = CITIES.find((c) => c.id === fromId);
  const b = CITIES.find((c) => c.id === toId);
  if (!a || !b || a.id === b.id) return null;
  const key = [a.id, b.id].sort().join("|");
  const known = KNOWN[key];
  const km = known ? known.km : Math.round(haversine(a, b) * 1.35);
  const hours = Math.round((km / 55) * 10) / 10;
  return {
    km,
    hours,
    via: known?.via ?? "Red troncal nacional (ruta estimada)",
    checkpoints: Math.max(1, Math.round(km / 70)),
    tolls: Math.max(0, Math.round(km / 120)),
  };
}

/** Cities near the straight-line corridor between two endpoints, ordered along the route. */
export function suggestStops(fromId: string, toId: string): City[] {
  const a = CITIES.find((c) => c.id === fromId);
  const b = CITIES.find((c) => c.id === toId);
  if (!a || !b || a.id === b.id) return [];
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  const cos = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return CITIES.map((c) => {
    const t = ((c.lng - a.lng) * dx + (c.lat - a.lat) * dy) / len2;
    const px = a.lng + t * dx;
    const py = a.lat + t * dy;
    const perpKm = Math.hypot((c.lng - px) * cos * 111.32, (c.lat - py) * 110.57);
    return { city: c, t, perpKm };
  })
    .filter(
      ({ city, t, perpKm }) =>
        city.id !== a.id && city.id !== b.id && t > 0.08 && t < 0.92 && perpKm <= 45,
    )
    .sort((x, y) => x.t - y.t)
    .map(({ city }) => city);
}

export type VehicleKind = "auto" | "pickup" | "furgon" | "camion350" | "camion750" | "gandola";

export const VEHICLE_PRESETS: Record<
  VehicleKind,
  {
    label: string;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    max_kg: number;
    example: string;
  }
> = {
  auto: {
    label: "Auto / maletero",
    length_cm: 100,
    width_cm: 130,
    height_cm: 40,
    max_kg: 400,
    example: "Toyota Corolla, Chevrolet Aveo, Renault Logan",
  },
  pickup: {
    label: "Camioneta pickup",
    length_cm: 160,
    width_cm: 150,
    height_cm: 50,
    max_kg: 1000,
    example: "Toyota Hilux, Ford Ranger",
  },
  furgon: {
    label: "Furgoneta / van",
    length_cm: 280,
    width_cm: 160,
    height_cm: 150,
    max_kg: 1000,
    example: "Chevrolet N300, Mitsubishi L300, Toyota Hiace",
  },
  camion350: {
    label: "Camión 350 (furgón)",
    length_cm: 420,
    width_cm: 200,
    height_cm: 200,
    max_kg: 3500,
    example: "Ford 350, Chevrolet NPR",
  },
  camion750: {
    label: "Camión 750 / Toronto",
    length_cm: 650,
    width_cm: 240,
    height_cm: 240,
    max_kg: 8000,
    example: "Ford F-750, Chevrolet NKR/FVR",
  },
  gandola: {
    label: "Gandola (semirremolque)",
    length_cm: 1300,
    width_cm: 245,
    height_cm: 260,
    max_kg: 30000,
    example: "Mack, Freightliner + batea/furgón",
  },
};

// Bultos típicos de encomienda en Venezuela: precargan nombre, medidas, peso y
// fragilidad en los formularios; todos los campos quedan editables al aplicar.
export type CargoPreset = {
  label: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  fragile: boolean;
};
export const CARGO_PRESETS: CargoPreset[] = [
  {
    label: "Saco 50 kg",
    name: "Saco de 50 kg",
    length: 80,
    width: 50,
    height: 30,
    weight: 50,
    fragile: false,
  },
  {
    label: "Caja mediana",
    name: "Caja mediana",
    length: 60,
    width: 40,
    height: 40,
    weight: 15,
    fragile: false,
  },
  {
    label: "Caja grande",
    name: "Caja grande",
    length: 80,
    width: 60,
    height: 50,
    weight: 25,
    fragile: false,
  },
  {
    label: "Maleta",
    name: "Maleta / equipaje",
    length: 60,
    width: 40,
    height: 25,
    weight: 20,
    fragile: false,
  },
  {
    label: "Televisor",
    name: "Televisor",
    length: 125,
    width: 75,
    height: 15,
    weight: 15,
    fragile: true,
  },
  {
    label: "Nevera",
    name: "Nevera",
    length: 70,
    width: 70,
    height: 170,
    weight: 65,
    fragile: true,
  },
];
