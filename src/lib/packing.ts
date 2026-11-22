export type Pkg = {
  id: string;
  name: string;
  length: number; // cm
  width: number;
  height: number;
  weight: number; // kg per unit
  qty: number;
  fragile: boolean;
  deadline: string; // ISO datetime or ""
  recipient: string;
  pickup?: string;
};

export type Container = { length: number; width: number; height: number; maxKg: number };

export type Placed = {
  pkgId: string;
  unit: number;
  name: string;
  x: number; y: number; z: number; // x along length (0 = cab), y width, z height
  l: number; w: number; h: number;
  weight: number;
  fragile: boolean;
  loadOrder: number; // 1 = load first
};

export type PackResult = {
  placed: Placed[];
  unplaced: { pkgId: string; name: string; unit: number; reason: string }[];
  usedVolumePct: number;
  usedKg: number;
  usedKgPct: number;
  freeM3: number;
  freeKg: number;
};

type Unit = { pkg: Pkg; unit: number };

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Extreme-point 3D packing heuristic.
 * - Packages delivered LAST go deepest (near the cab) so the first deliveries are at the door.
 * - Heavy before light, so heavy boxes end up on the floor.
 * - Nothing is stacked on top of a fragile box, and a box needs 70% of its base supported.
 */
export function packCargo(container: Container, pkgs: Pkg[]): PackResult {
  const units: Unit[] = [];
  for (const p of pkgs) for (let i = 0; i < Math.max(0, Math.floor(p.qty)); i++) units.push({ pkg: p, unit: i + 1 });

  const deadlineVal = (p: Pkg) => (p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY);
  units.sort((a, b) => {
    const d = deadlineVal(b.pkg) - deadlineVal(a.pkg); // latest deadline first
    if (d !== 0 && Number.isFinite(d)) return d;
    if (!Number.isFinite(deadlineVal(a.pkg)) !== !Number.isFinite(deadlineVal(b.pkg)))
      return Number.isFinite(deadlineVal(a.pkg)) ? 1 : -1;
    if (a.pkg.fragile !== b.pkg.fragile) return a.pkg.fragile ? 1 : -1;
    if (b.pkg.weight !== a.pkg.weight) return b.pkg.weight - a.pkg.weight;
    return b.pkg.length * b.pkg.width * b.pkg.height - a.pkg.length * a.pkg.width * a.pkg.height;
  });

  const placed: Placed[] = [];
  const unplaced: PackResult["unplaced"] = [];
  let points: [number, number, number][] = [[0, 0, 0]];
  let kg = 0;

  const fits = (x: number, y: number, z: number, l: number, w: number, h: number) => {
    if (x + l > container.length || y + w > container.width || z + h > container.height) return false;
    for (const b of placed)
      if (overlap(x, x + l, b.x, b.x + b.l) && overlap(y, y + w, b.y, b.y + b.w) && overlap(z, z + h, b.z, b.z + b.h)) return false;
    if (z === 0) return true;
    let supported = 0;
    for (const b of placed) {
      if (Math.abs(b.z + b.h - z) > 0.01) continue;
      const ox = Math.min(x + l, b.x + b.l) - Math.max(x, b.x);
      const oy = Math.min(y + w, b.y + b.w) - Math.max(y, b.y);
      if (ox > 0 && oy > 0) {
        if (b.fragile) return false;
        supported += ox * oy;
      }
    }
    return supported >= 0.7 * l * w;
  };

  for (const u of units) {
    const p = u.pkg;
    if (kg + p.weight > container.maxKg) {
      unplaced.push({ pkgId: p.id, name: p.name, unit: u.unit, reason: "Excede el peso máximo" });
      continue;
    }
    const orients: [number, number, number][] = [[p.length, p.width, p.height], [p.width, p.length, p.height]];
    let best: { x: number; y: number; z: number; l: number; w: number; h: number } | null = null;
    for (const [x, y, z] of points) {
      for (const [l, w, h] of orients) {
        if (!fits(x, y, z, l, w, h)) continue;
        if (!best || x < best.x || (x === best.x && (z < best.z || (z === best.z && y < best.y)))) best = { x, y, z, l, w, h };
      }
    }
    if (!best) {
      unplaced.push({ pkgId: p.id, name: p.name, unit: u.unit, reason: "No cabe en el espacio disponible" });
      continue;
    }
    placed.push({ pkgId: p.id, unit: u.unit, name: p.name, ...best, weight: p.weight, fragile: p.fragile, loadOrder: placed.length + 1 });
    kg += p.weight;
    const chosen = best;
    points = points.filter((pt) => !(pt[0] === chosen.x && pt[1] === chosen.y && pt[2] === chosen.z));
    points.push([best.x + best.l, best.y, best.z], [best.x, best.y + best.w, best.z], [best.x, best.y, best.z + best.h]);
  }

  const vol = container.length * container.width * container.height;
  const used = placed.reduce((s, b) => s + b.l * b.w * b.h, 0);
  return {
    placed,
    unplaced,
    usedVolumePct: vol ? Math.round((used / vol) * 1000) / 10 : 0,
    usedKg: kg,
    usedKgPct: container.maxKg ? Math.round((kg / container.maxKg) * 1000) / 10 : 0,
    freeM3: Math.round(((vol - used) / 1e6) * 100) / 100,
    freeKg: Math.max(0, container.maxKg - kg),
  };
}
