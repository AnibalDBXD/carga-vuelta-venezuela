import { describe, expect, it, vi } from "vitest";
import { suggestStops } from "@/lib/venezuela";
import {
  PROMO_FORMATS,
  renderPromoCard,
  type PromoData,
  type PromoFormat,
} from "@/lib/promo-image";

describe("suggestStops", () => {
  it("suggests Maracay on the Valencia → Caracas corridor", () => {
    expect(suggestStops("valencia", "caracas").map((c) => c.id)).toEqual(["maracay"]);
  });

  it("suggests the same stops for the reverse route", () => {
    expect(suggestStops("caracas", "valencia").map((c) => c.id)).toEqual(["maracay"]);
  });

  it("returns no stops when nothing lies near the corridor", () => {
    expect(suggestStops("valencia", "puerto-cabello")).toEqual([]);
  });

  it("returns no stops for unknown or identical endpoints", () => {
    expect(suggestStops("valencia", "valencia")).toEqual([]);
    expect(suggestStops("valencia", "atlantis")).toEqual([]);
  });
});

const DATA: PromoData = {
  ownerName: "José Pérez",
  url: "https://cargaruta.app/bolsa/3f8a1b2c-1234-4a5b-9c8d-0123456789ab",
  originName: "Puerto La Cruz",
  destinationName: "San Cristóbal",
  date: "2026-11-25",
  stops: ["Maracay", "Barquisimeto", "Acarigua", "Barinas"],
  vehicle: {
    name: "Ford F-750 de Papá",
    kindLabel: "Camión 750 / Toronto",
    lengthCm: 650,
    widthCm: 240,
    heightCm: 240,
    maxKg: 8000,
  },
  freeM3: 16.8,
  freeKg: 3500,
};

function fakeCanvas() {
  const texts: { text: string; y: number }[] = [];
  const ctx = {
    measureText: (s: string) => ({ width: s.length * 30 }),
    fillText: (text: string, _x: number, y: number) => texts.push({ text, y }),
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    fillRect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    arcTo() {},
    translate() {},
    scale() {},
    roundRect() {},
    setLineDash() {},
  } as unknown as CanvasRenderingContext2D;
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, texts };
}

describe("renderPromoCard", () => {
  vi.stubGlobal(
    "Path2D",
    class {
      constructor(_d?: string) {}
    },
  );

  it.each(Object.keys(PROMO_FORMATS) as PromoFormat[])(
    "lays out every line inside the %s canvas",
    async (format) => {
      const { canvas, texts } = fakeCanvas();
      await renderPromoCard(canvas, DATA, format);
      const { width, height } = PROMO_FORMATS[format];
      expect([canvas.width, canvas.height]).toEqual([width, height]);
      expect(texts.length).toBeGreaterThan(10);
      for (const { text, y } of texts) {
        expect(y, `line "${text}" overflows`).toBeLessThan(height);
      }
    },
  );
});
