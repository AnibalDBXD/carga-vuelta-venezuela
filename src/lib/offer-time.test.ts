import { describe, expect, it } from "vitest";
import { offerDeparted, offerDepartureAt, offerProgress } from "./offer-time";

const offer = (over: Partial<Parameters<typeof offerDeparted>[0]> = {}) => ({
  available_date: "2026-11-23",
  available_time: "18:30:00",
  ...over,
});

describe("offerDepartureAt", () => {
  it("interpreta la hora como Venezuela (UTC-4)", () => {
    expect(offerDepartureAt(offer()).toISOString()).toBe("2026-11-23T22:30:00.000Z");
  });
  it("sin hora, vence al final del día", () => {
    expect(offerDepartureAt(offer({ available_time: null })).toISOString()).toBe(
      "2026-11-24T03:59:59.000Z",
    );
  });
});

describe("offerDeparted", () => {
  it("no salió antes de la hora", () => {
    expect(offerDeparted(offer(), new Date("2026-11-23T22:29:59Z"))).toBe(false);
  });
  it("salió justo a la hora estimada", () => {
    expect(offerDeparted(offer(), new Date("2026-11-23T22:30:00Z"))).toBe(true);
  });
});

describe("offerProgress", () => {
  const o = { ...offer(), created_at: "2026-11-23T14:30:00Z" }; // ventana de 8 h
  it("empieza en 1 al publicarse", () => {
    expect(offerProgress(o, new Date("2026-11-23T14:30:00Z"))).toBe(1);
  });
  it("va por la mitad a mitad de la ventana", () => {
    expect(offerProgress(o, new Date("2026-11-23T18:30:00Z"))).toBe(0.5);
  });
  it("llega a 0 a la hora de salida", () => {
    expect(offerProgress(o, new Date("2026-11-23T22:30:00Z"))).toBe(0);
  });
  it("no baja de 0 ni sube de 1", () => {
    expect(offerProgress(o, new Date("2026-11-24T00:00:00Z"))).toBe(0);
    expect(offerProgress(o, new Date("2026-11-23T14:00:00Z"))).toBe(1);
  });
  it("created_at inválido o posterior a la salida da 0", () => {
    expect(offerProgress({ ...o, created_at: "no-fecha" })).toBe(0);
    expect(offerProgress({ ...o, created_at: "2026-11-24T00:00:00Z" })).toBe(0);
  });
});
