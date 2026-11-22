import { describe, expect, it } from "vitest";
import { parseDirections } from "./mapbox";

// Respuesta mínima real de Directions API v5 (Valencia → Caracas, ARC).
const FIXTURE = {
  routes: [
    {
      distance: 165400,
      duration: 6480,
      geometry: {
        type: "LineString",
        coordinates: [
          [-68.007, 10.162],
          [-67.5958, 10.2469],
          [-66.9036, 10.4806],
        ],
      },
      legs: [
        {
          steps: [
            { distance: 52000, maneuver: { instruction: "Salga hacia el este por la ARC" } },
            { distance: 61000, maneuver: { instruction: "Continúe por la ARC hacia Maracay" } },
            { distance: 52400, maneuver: { instruction: "Gire a la derecha hacia Caracas" } },
          ],
        },
      ],
    },
  ],
};

describe("parseDirections", () => {
  it("extrae km, horas, geometría e indicaciones en español", () => {
    const route = parseDirections(FIXTURE);
    expect(route).not.toBeNull();
    expect(route!.km).toBe(165.4);
    expect(route!.hours).toBe(1.8);
    expect(route!.geometry.type).toBe("LineString");
    expect(route!.geometry.coordinates).toHaveLength(3);
    expect(route!.steps).toHaveLength(3);
    expect(route!.steps[0]).toEqual({ instruction: "Salga hacia el este por la ARC", km: 52 });
  });

  it("devuelve null sin rutas o sin geometría", () => {
    expect(parseDirections({ routes: [] })).toBeNull();
    expect(parseDirections({ routes: [{ distance: 1, duration: 1 }] })).toBeNull();
    expect(parseDirections(null)).toBeNull();
    expect(parseDirections("x")).toBeNull();
  });

  it("tolera steps sin instrucción", () => {
    const route = parseDirections({
      routes: [
        {
          distance: 1000,
          duration: 60,
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          legs: [{ steps: [{ distance: 1000, maneuver: {} }] }],
        },
      ],
    });
    expect(route!.steps).toEqual([]);
  });
});
