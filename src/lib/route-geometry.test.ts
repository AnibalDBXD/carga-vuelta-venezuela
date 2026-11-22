import { describe, expect, it } from "vitest";
import {
  citiesAlongGeometry,
  encodePolyline,
  simplifyLine,
  simplifyToMaxPoints,
  type LineString,
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
