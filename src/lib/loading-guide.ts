import type { Placed } from "./packing";

// A layer groups packages by the height of their base, not by their top edge.
export function cargoLayers(boxes: Placed[]): number[] {
  return [...new Set(boxes.map((box) => box.z))].sort((a, b) => a - b);
}

export function visibleCargo(boxes: Placed[], layer: number | null, step: number | null): Placed[] {
  return boxes.filter((box) =>
    (layer === null || box.z === layer) && (step === null || box.loadOrder <= step),
  );
}

export function loadingSteps(boxes: Placed[]): Placed[] {
  return [...boxes].sort((a, b) => a.loadOrder - b.loadOrder);
}