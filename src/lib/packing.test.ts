import { describe, expect, it } from "vitest";
import { packCargo, type Pkg } from "./packing";

const box = (o: Partial<Pkg>): Pkg => ({ id: "a", name: "Caja", length: 100, width: 100, height: 100, weight: 10, qty: 1, fragile: false, deadline: "", recipient: "", ...o });
const truck = { length: 200, width: 100, height: 200, maxKg: 1000 };

describe("packCargo", () => {
  it("never stacks anything on top of a fragile box", () => {
    const r = packCargo({ length: 100, width: 100, height: 200, maxKg: 1000 }, [box({ id: "f", fragile: true }), box({ id: "n" })]);
    const fragile = r.placed.find((p) => p.pkgId === "f")!;
    expect(fragile.z).toBe(100); // non-fragile goes under, fragile on top
  });

  it("rejects units that exceed the max weight", () => {
    const r = packCargo({ ...truck, maxKg: 15 }, [box({ qty: 2 })]);
    expect(r.placed).toHaveLength(1);
    expect(r.unplaced[0]?.reason).toBe("Excede el peso máximo");
  });

  it("puts the latest delivery deepest (near the cab)", () => {
    const r = packCargo(truck, [box({ id: "early", deadline: "2026-01-01T10:00" }), box({ id: "late", deadline: "2026-01-02T10:00" })]);
    expect(r.placed.find((p) => p.pkgId === "late")!.loadOrder).toBe(1);
    expect(r.placed.find((p) => p.pkgId === "early")!.loadOrder).toBe(2);
  });

  it("reports what does not fit", () => {
    const r = packCargo(truck, [box({ length: 300 })]);
    expect(r.unplaced).toHaveLength(1);
    expect(r.freeM3).toBe(4);
  });
});
