import { describe, expect, it } from "vitest";
import {
  citiesAlongGeometry,
  corridorProjection,
  distanceToLine,
  encodePolyline,
  googleMapsDirUrl,
  orderStops,
  simplifyLine,
  simplifyToMaxPoints,
  type LineString,
  type LngLat,
  type RouteStop,
} from "./route-geometry";
import { nearestCity } from "./venezuela";

// Valencia → Maracay → Caracas (coordenadas reales, [lng, lat]).
const ARC: LineString = {
  type: "LineString",
  coordinates: [
    [-68.007, 10.162],
    [-67.5958, 10.2469],
    [-66.9036, 10.4806],
  ],
};

describe("citiesAlongGeometry", () => {
  it("encuentra las ciudades sobre la vía real, excluyendo extremos", () => {
    expect(citiesAlongGeometry(ARC, "valencia", "caracas").map((c) => c.id)).toEqual(["maracay"]);
  });

  it("excluye ciudades lejos del corredor vial", () => {
    const ids = citiesAlongGeometry(ARC, "valencia", "caracas").map((c) => c.id);
    expect(ids).not.toContain("maracaibo");
    expect(ids).not.toContain("maturin");
  });

  it("ordena por posición sobre la ruta", () => {
    // Ruta Valencia → Puerto Ordaz pasando cerca de San Juan de los Morros.
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [-68.007, 10.162],
        [-67.6, 10.0],
        [-67.3538, 9.9115],
        [-65.5, 9.0],
        [-62.7117, 8.296],
      ],
    };
    const ids = citiesAlongGeometry(line, "valencia", "puerto-ordaz", 30).map((c) => c.id);
    expect(ids.indexOf("san-juan")).toBeGreaterThanOrEqual(0);
  });

  it("respeta el radio máximo", () => {
    // Recta Valencia → Caracas: Maracay queda a unos km de la línea, fuera de 1 km.
    const straight: LineString = {
      type: "LineString",
      coordinates: [
        [-68.007, 10.162],
        [-66.9036, 10.4806],
      ],
    };
    expect(citiesAlongGeometry(straight, "valencia", "caracas", 1)).toEqual([]);
  });

  it("devuelve vacío con geometría degenerada", () => {
    expect(citiesAlongGeometry({ type: "LineString", coordinates: [] }, "a", "b")).toEqual([]);
  });
});

const VALENCIA: LngLat = [-68.007, 10.162];
const CARACAS: LngLat = [-66.9036, 10.4806];

describe("corridorProjection", () => {
  it("t≈0 en el origen y t≈1 en el destino, con distancia 0", () => {
    const o = corridorProjection(VALENCIA, CARACAS, VALENCIA);
    expect(o.t).toBeCloseTo(0, 6);
    expect(o.dKm).toBeCloseTo(0, 6);
    const d = corridorProjection(VALENCIA, CARACAS, CARACAS);
    expect(d.t).toBeCloseTo(1, 6);
    expect(d.dKm).toBeCloseTo(0, 6);
  });

  it("ubica puntos intermedios sobre el eje y mide la distancia lateral", () => {
    // Maracay: sobre el corredor, más cerca de Valencia que de Caracas.
    const m = corridorProjection(VALENCIA, CARACAS, [-67.5958, 10.2469]);
    expect(m.t).toBeGreaterThan(0.2);
    expect(m.t).toBeLessThan(0.5);
    expect(m.dKm).toBeLessThan(20);
  });

  it("t sale de [0,1] para puntos fuera del tramo", () => {
    expect(corridorProjection(VALENCIA, CARACAS, [-69.357, 10.0647]).t).toBeLessThan(0); // Barquisimeto
    expect(corridorProjection(VALENCIA, CARACAS, [-64.6167, 10.2167]).t).toBeGreaterThan(1); // Pto. La Cruz
  });
});

const stop = (
  requestId: string,
  kind: "pickup" | "delivery",
  lng: number,
  lat: number,
): RouteStop => ({ requestId, kind, lng, lat, label: `${kind} ${requestId}` });

describe("orderStops", () => {
  it("ordena las paradas por su posición sobre el corredor", () => {
    const out = orderStops(VALENCIA, CARACAS, [
      stop("b", "delivery", -66.95, 10.45), // cerca de Caracas
      stop("a", "pickup", -68.0, 10.16), // junto a Valencia
      stop("m", "pickup", -67.6, 10.25), // Maracay, a mitad de camino
    ]);
    expect(out.map((s) => s.requestId)).toEqual(["a", "m", "b"]);
  });

  it("una entrega nunca queda antes de la recogida de su solicitud", () => {
    // La entrega geocodifica "antes" que su recogida en el corredor: se reubica.
    const out = orderStops(VALENCIA, CARACAS, [
      stop("x", "delivery", -68.2, 10.1),
      stop("x", "pickup", -66.95, 10.45),
      stop("y", "pickup", -67.6, 10.25),
    ]);
    const pickup = out.findIndex((s) => s.requestId === "x" && s.kind === "pickup");
    const delivery = out.findIndex((s) => s.requestId === "x" && s.kind === "delivery");
    expect(delivery).toBeGreaterThan(pickup);
    expect(delivery).toBe(pickup + 1);
  });

  it("conserva el orden de entregas ya correctas y permite recogidas sin entrega", () => {
    const input = [
      stop("x", "pickup", -68.0, 10.16),
      stop("x", "delivery", -67.0, 10.4),
      stop("z", "pickup", -67.6, 10.25),
    ];
    const out = orderStops(VALENCIA, CARACAS, input);
    expect(out.map((s) => `${s.requestId}:${s.kind}`)).toEqual([
      "x:pickup",
      "z:pickup",
      "x:delivery",
    ]);
  });
});

describe("googleMapsDirUrl", () => {
  it("arma la ruta con origen y destino en lat,lng", () => {
    const url = googleMapsDirUrl(VALENCIA, CARACAS);
    expect(url).toContain("https://www.google.com/maps/dir/?");
    expect(url).toContain("api=1");
    expect(url).toContain("travelmode=driving");
    expect(url).toContain("origin=10.162%2C-68.007");
    expect(url).toContain("destination=10.4806%2C-66.9036");
    expect(url).not.toContain("waypoints");
  });

  it("incluye las paradas como waypoints y recorta a 9", () => {
    const stops = Array.from({ length: 12 }, (_, i) =>
      stop(`r${i}`, "pickup", -68 + i * 0.01, 10.2),
    );
    const url = googleMapsDirUrl(VALENCIA, CARACAS, stops);
    const wp = decodeURIComponent(new URL(url).searchParams.get("waypoints") ?? "");
    expect(wp.split("|")).toHaveLength(9);
    expect(wp).toContain("10.2,-68");
    expect(googleMapsDirUrl(VALENCIA, CARACAS, [stop("a", "pickup", -67.6, 10.25)])).toContain(
      "waypoints=10.25%2C-67.6",
    );
  });
});

describe("encodePolyline", () => {
  it("coincide con el vector canónico de Google", () => {
    // Ejemplo oficial: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
    const encoded = encodePolyline([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("devuelve vacío para una línea vacía", () => {
    expect(encodePolyline([])).toBe("");
  });
});

describe("simplifyLine", () => {
  it("colapsa puntos colineales dejando los extremos", () => {
    const line: [number, number][] = [
      [0, 0],
      [0.5, 0.0001],
      [1, 0],
    ];
    expect(simplifyLine(line, 0.001)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("conserva vértices que se desvían más que la tolerancia", () => {
    const line: [number, number][] = [
      [0, 0],
      [0.5, 0.1],
      [1, 0],
    ];
    expect(simplifyLine(line, 0.001)).toHaveLength(3);
  });
});

describe("nearestCity", () => {
  it("ajusta un punto a la ciudad troncal más cercana", () => {
    // La Victoria (~10.23, -67.33): en la red solo existe Maracay cerca.
    expect(nearestCity(-67.33, 10.23)?.id).toBe("maracay");
    // Un punto junto al centro de Valencia.
    expect(nearestCity(-68.0, 10.17)?.id).toBe("valencia");
    // Lejos del centro pero más cerca de Maracaibo que de cualquier otra.
    expect(nearestCity(-71.6, 10.6)?.id).toBe("maracaibo");
  });

  it("devuelve null con una lista vacía", () => {
    expect(nearestCity(-68, 10, [])).toBeNull();
  });
});

describe("simplifyToMaxPoints", () => {
  it("respeta el tope de puntos conservando extremos", () => {
    const zig: [number, number][] = Array.from({ length: 200 }, (_, i) => [
      i * 0.01,
      i % 2 === 0 ? 0 : 0.01,
    ]);
    const out = simplifyToMaxPoints(zig, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0]).toEqual(zig[0]);
    expect(out.at(-1)).toEqual(zig.at(-1));
  });
});

describe("distanceToLine", () => {
  it("punto sobre la ruta: distancia ~0 y t por su posición", () => {
    // Maracay es el vértice medio del ARC.
    const { dKm, t } = distanceToLine(ARC, [-67.5958, 10.2469]);
    expect(dKm).toBeLessThan(0.5);
    expect(t).toBeCloseTo(0.5, 1);
  });

  it("punto detrás del origen queda con t negativa", () => {
    // Un punto al oeste de Valencia (inicio del ARC).
    const { t, dKm } = distanceToLine(ARC, [-68.5, 10.1]);
    expect(t).toBeLessThan(0.05);
    expect(dKm).toBeGreaterThan(20);
  });

  it("punto lejos de la ruta reporta la distancia real", () => {
    // Maturín (~10.6, -63.2) está a cientos de km del ARC.
    const { dKm } = distanceToLine(ARC, [-63.2, 10.6]);
    expect(dKm).toBeGreaterThan(200);
  });

  it("línea vacía devuelve distancia infinita", () => {
    expect(distanceToLine({ type: "LineString", coordinates: [] }, [-67, 10]).dKm).toBe(Infinity);
  });
});
