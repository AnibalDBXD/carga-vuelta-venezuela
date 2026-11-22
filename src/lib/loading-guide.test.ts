import { describe, expect, it } from "vitest";
import { cargoLayers, loadingSteps, visibleCargo } from "./loading-guide";
import type { Placed } from "./packing";

const boxes: Placed[] = [
  { pkgId: "glass", unit: 1, name: "Vidrio", x: 0, y: 0, z: 60, l: 40, w: 40, h: 30, weight: 10, fragile: true, loadOrder: 3 },
  { pkgId: "heavy", unit: 1, name: "Pintura", x: 0, y: 0, z: 0, l: 40, w: 40, h: 60, weight: 30, fragile: false, loadOrder: 1 },
  { pkgId: "clothes", unit: 1, name: "Ropa", x: 40, y: 0, z: 0, l: 40, w: 40, h: 30, weight: 5, fragile: false, loadOrder: 2 },
];

describe("cargo loading guide", () => {
  it("separates layers by base height, from floor upwards", () => {
    expect(cargoLayers(boxes)).toEqual([0, 60]);
    expect(visibleCargo(boxes, 60, null).map((box) => box.pkgId)).toEqual(["glass"]);
    expect(visibleCargo(boxes, 0, null).map((box) => box.pkgId)).toEqual(["heavy", "clothes"]);
  });
  it("follows loading order and hides packages from future steps", () => {
    expect(loadingSteps(boxes).map((box) => box.loadOrder)).toEqual([1, 2, 3]);
    expect(visibleCargo(boxes, null, 1).map((box) => box.pkgId)).toEqual(["heavy"]);
    expect(visibleCargo(boxes, null, 3)).toHaveLength(3);
  });
  it("combines the step and layer filters without changing the cargo", () => {
    expect(visibleCargo(boxes, 60, 2)).toEqual([]);
    expect(visibleCargo(boxes, null, null)).toHaveLength(3);
    expect(cargoLayers([])).toEqual([]);
  });
});