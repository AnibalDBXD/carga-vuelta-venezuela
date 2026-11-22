import { describe, expect, it } from "vitest";
import { offerDeparted, offerDepartureAt, offerProgress } from "./offer-time";

const offer = (over: Partial<Parameters<typeof offerDeparted>[0]> = {}) => ({
  available_date: "2026-11-23",
  available_time: "18:30:00",
  ...over,
});
// Salida: 2026-11-23 18:30 VET = 22:30 UTC.
const DEPARTS_UTC = "2026-11-23T22:30:00.000Z";

describe("offerDepartureAt", () => {
  it("interpreta la hora como Venezuela (UTC-4)", () => {
    expect(offerDepartureAt(offer()).toISOString()).toBe(DEPARTS_UTC);
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
  it("va llena (1) con 20 h o más por delante", () => {
    expect(offerProgress(offer(), new Date("2026-11-23T02:30:00Z"))).toBe(1);
    expect(offerProgress(offer(), new Date("2026-11-22T10:00:00Z"))).toBe(1);
  });
  it("va por la mitad a 10 h de la salida", () => {
    expect(offerProgress(offer(), new Date("2026-11-23T12:30:00Z"))).toBe(0.5);
  });
  it("1 h restante ≈ 5% (rojo)", () => {
    expect(offerProgress(offer(), new Date("2026-11-23T21:30:00Z"))).toBeCloseTo(0.05);
  });
  it("llega a 0 a la hora de salida y no baja de 0", () => {
    expect(offerProgress(offer(), new Date(DEPARTS_UTC))).toBe(0);
    expect(offerProgress(offer(), new Date("2026-11-24T00:00:00Z"))).toBe(0);
  });
});
