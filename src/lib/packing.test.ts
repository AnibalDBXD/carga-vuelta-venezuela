import { describe, expect, it } from "vitest";
import { packCargo, type Pkg } from "./packing";

const box = (o: Partial<Pkg>): Pkg => ({
  id: "a",
  name: "Caja",
  length: 100,
  width: 100,
  height: 100,
  weight: 10,
  qty: 1,
  fragile: false,
  deadline: "",
  recipient: "",
  ...o,
});
const truck = { length: 200, width: 100, height: 200, maxKg: 1000 };

describe("packCargo", () => {
  it("never stacks anything on top of a fragile box", () => {
    const r = packCargo({ length: 100, width: 100, height: 200, maxKg: 1000 }, [
      box({ id: "f", fragile: true }),
      box({ id: "n" }),
    ]);
    const fragile = r.placed.find((p) => p.pkgId === "f")!;
    expect(fragile.z).toBe(100); // non-fragile goes under, fragile on top
  });

  it("rejects units that exceed the max weight", () => {
    const r = packCargo({ ...truck, maxKg: 15 }, [box({ qty: 2 })]);
    expect(r.placed).toHaveLength(1);
    expect(r.unplaced[0]?.reason).toBe("Excede el peso máximo");
  });

  it("puts the latest delivery deepest (near the cab)", () => {
    const r = packCargo(truck, [
      box({ id: "early", deadline: "2026-01-01T10:00" }),
      box({ id: "late", deadline: "2026-01-02T10:00" }),
    ]);
    expect(r.placed.find((p) => p.pkgId === "late")!.loadOrder).toBe(1);
    expect(r.placed.find((p) => p.pkgId === "early")!.loadOrder).toBe(2);
  });

  it("reports what does not fit", () => {
    const r = packCargo(truck, [box({ length: 300 })]);
    expect(r.unplaced).toHaveLength(1);
    expect(r.freeM3).toBe(4);
  });

  it("expands qty into numbered units", () => {
    const r = packCargo(truck, [box({ qty: 3 })]);
    expect(r.placed).toHaveLength(3);
    expect(r.placed.map((p) => p.unit)).toEqual([1, 2, 3]);
  });

  it("rotates a package 90° on the floor when it helps", () => {
    // 100×200 no cabe de ancho (W=100); la rotación que gana es la que deja la
    // menor huella: parado a 100×100×200 de alto.
    const r = packCargo(truck, [box({ length: 100, width: 200 })]);
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0]).toMatchObject({ l: 100, w: 100, h: 200 });
  });

  it("stands a package upright when only its height fits", () => {
    // 150 de largo no cabe en L=100; parado a 50×50×150 sí.
    const r = packCargo(truck, [box({ length: 150, width: 50, height: 50 })]);
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0]).toMatchObject({ l: 50, w: 50, h: 150 });
  });

  it("caps stacks with fragile boxes instead of spreading them on the floor", () => {
    // Los frágiles sobre el piso bloquean todo el espacio vertical encima:
    // deben coronar las pilas. Caso real: gandola con sacos + televisores.
    const r = packCargo({ length: 1300, width: 245, height: 260, maxKg: 30000 }, [
      box({ id: "saco", length: 80, width: 50, height: 30, weight: 50, qty: 67 }),
      box({
        id: "tv",
        name: "TV",
        length: 125,
        width: 75,
        height: 15,
        weight: 15,
        qty: 32,
        fragile: true,
      }),
      box({ id: "maleta", length: 60, width: 40, height: 25, weight: 20, qty: 7 }),
      box({ id: "nevera", length: 70, width: 70, height: 170, weight: 65, qty: 7, fragile: true }),
    ]);
    expect(r.unplaced).toHaveLength(0);
    const tvFloor = r.placed.filter((p) => p.pkgId === "tv" && p.z === 0 && p.h < 100);
    // Ningún TV acostado en el piso desperdiciando la altura encima.
    expect(tvFloor).toHaveLength(0);
  });

  it("rejects a package too big in a single dimension", () => {
    const r = packCargo(truck, [box({ length: 300, width: 300 })]);
    expect(r.unplaced[0]?.reason).toBe("No cabe en el espacio disponible");
  });

  it("keeps every raised box at least 70% supported by non-fragile cargo", () => {
    const r = packCargo({ length: 400, width: 200, height: 200, maxKg: 5000 }, [
      box({ id: "base", length: 200, width: 200, height: 50, weight: 100, qty: 2 }),
      box({ id: "mid", length: 100, width: 100, height: 60, weight: 30, qty: 4 }),
      box({ id: "top", length: 60, width: 60, height: 60, weight: 10, qty: 4 }),
    ]);
    for (const b of r.placed.filter((p) => p.z > 0)) {
      const supporters = r.placed.filter((o) => Math.abs(o.z + o.h - b.z) < 0.01);
      const supported = supporters.reduce(
        (s, o) =>
          s +
          Math.max(0, Math.min(b.x + b.l, o.x + o.l) - Math.max(b.x, o.x)) *
            Math.max(0, Math.min(b.y + b.w, o.y + o.w) - Math.max(b.y, o.y)),
        0,
      );
      expect(supported).toBeGreaterThanOrEqual(0.7 * b.l * b.w);
      expect(supporters.every((o) => !o.fragile)).toBe(true);
    }
  });

  it("never places overlapping boxes", () => {
    const r = packCargo(truck, [box({ id: "a", qty: 2 }), box({ id: "b", qty: 2 })]);
    for (const x of r.placed)
      for (const y of r.placed) {
        if (x === y) continue;
        const hit =
          x.x < y.x + y.l &&
          y.x < x.x + x.l &&
          x.y < y.y + y.w &&
          y.y < x.y + x.w &&
          x.z < y.z + y.h &&
          y.z < x.z + x.h;
        expect(hit).toBe(false);
      }
  });
});
