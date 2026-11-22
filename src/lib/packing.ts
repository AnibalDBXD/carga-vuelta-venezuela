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
  x: number;
  y: number;
  z: number; // x along length (0 = cab), y width, z height
  l: number;
  w: number;
  h: number;
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
type Candidate = {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  contact: number;
};

const EPS = 0.01;

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Lexicographic compare of equal-length key arrays. */
const lessKey = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi) return ai < bi;
  }
  return false;
};

/** The 6 axis-aligned rotations of a package, deduplicated. */
const orientationsOf = (p: Pkg): [number, number, number][] => {
  const { length: l, width: w, height: h } = p;
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (const o of [
    [l, w, h],
    [l, h, w],
    [w, l, h],
    [w, h, l],
    [h, l, w],
    [h, w, l],
  ] as [number, number, number][]) {
    const k = o.join(",");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  }
  return out;
};

/**
 * Extreme-point 3D packing heuristic.
 * - Packages delivered LAST go deepest (near the cab) so the first deliveries are at the door.
 * - Heavy before light, so heavy boxes end up on the floor.
 * - Nothing is stacked on top of a fragile box, and a box needs 70% of its base supported.
 * - Fragile boxes prefer the highest supported spot: they cap the stacks instead of
 *   spreading over the floor, which would waste all the space above them.
 * - All 6 rotations are tried; at the same anchor the snuggest orientation wins.
 */
export function packCargo(container: Container, pkgs: Pkg[]): PackResult {
  const units: Unit[] = [];
  for (const p of pkgs)
    for (let i = 0; i < Math.max(0, Math.floor(p.qty)); i++) units.push({ pkg: p, unit: i + 1 });

  const deadlineVal = (p: Pkg) =>
    p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
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
  const orientsCache = new Map<string, [number, number, number][]>();

  /**
   * Feasibility + snugness score. Returns the total contact area (cm²) the box
   * would share with the floor, walls and neighbouring boxes, or -1 if it does
   * not fit: out of bounds, overlapping, resting on a fragile box, or with less
   * than 70% of its base supported.
   */
  const contactIfFits = (x: number, y: number, z: number, l: number, w: number, h: number) => {
    if (x + l > container.length || y + w > container.width || z + h > container.height) return -1;
    for (const b of placed)
      if (
        overlap(x, x + l, b.x, b.x + b.l) &&
        overlap(y, y + w, b.y, b.y + b.w) &&
        overlap(z, z + h, b.z, b.z + b.h)
      )
        return -1;
    let supported = 0;
    if (z > 0) {
      for (const b of placed) {
        if (Math.abs(b.z + b.h - z) > EPS) continue;
        const ox = Math.min(x + l, b.x + b.l) - Math.max(x, b.x);
        const oy = Math.min(y + w, b.y + b.w) - Math.max(y, b.y);
        if (ox > 0 && oy > 0) {
          if (b.fragile) return -1;
          supported += ox * oy;
        }
      }
      if (supported < 0.7 * l * w) return -1;
    }
    let contact = z === 0 ? l * w : supported;
    if (x === 0) contact += w * h;
    if (y === 0) contact += l * h;
    if (x + l === container.length) contact += w * h;
    if (y + w === container.width) contact += l * h;
    if (z + h === container.height) contact += l * w;
    for (const b of placed) {
      const oy = Math.max(0, Math.min(y + w, b.y + b.w) - Math.max(y, b.y));
      const oz = Math.max(0, Math.min(z + h, b.z + b.h) - Math.max(z, b.z));
      const ox = Math.max(0, Math.min(x + l, b.x + b.l) - Math.max(x, b.x));
      if (Math.abs(b.x + b.l - x) < EPS || Math.abs(b.x - (x + l)) < EPS) contact += oy * oz;
      if (Math.abs(b.y + b.w - y) < EPS || Math.abs(b.y - (y + w)) < EPS) contact += ox * oz;
      if (Math.abs(b.z - (z + h)) < EPS) contact += ox * oy; // something already hangs above
    }
    return contact;
  };

  for (const u of units) {
    const p = u.pkg;
    if (kg + p.weight > container.maxKg) {
      unplaced.push({ pkgId: p.id, name: p.name, unit: u.unit, reason: "Excede el peso máximo" });
      continue;
    }
    let orients = orientsCache.get(p.id);
    if (!orients) orientsCache.set(p.id, (orients = orientationsOf(p)));
    // Ranking: non-fragile goes deep and low; fragile caps the highest stack it
    // can rest on. Then compact footprint (fragile) / contact (non-fragile).
    const keyOf = (c: Candidate) =>
      p.fragile ? [-c.z, c.x, c.y, c.l * c.w, -c.contact] : [c.x, c.z, c.y, -c.contact, c.l * c.w];
    let best: Candidate | null = null;
    let bestKey: number[] = [];
    for (const [x, y, z] of points) {
      for (const [l, w, h] of orients) {
        const contact = contactIfFits(x, y, z, l, w, h);
        if (contact < 0) continue;
        const cand: Candidate = { x, y, z, l, w, h, contact };
        const key = keyOf(cand);
        if (!best || lessKey(key, bestKey)) {
          best = cand;
          bestKey = key;
        }
      }
    }
    if (!best) {
      unplaced.push({
        pkgId: p.id,
        name: p.name,
        unit: u.unit,
        reason: "No cabe en el espacio disponible",
      });
      continue;
    }
    placed.push({
      pkgId: p.id,
      unit: u.unit,
      name: p.name,
      x: best.x,
      y: best.y,
      z: best.z,
      l: best.l,
      w: best.w,
      h: best.h,
      weight: p.weight,
      fragile: p.fragile,
      loadOrder: placed.length + 1,
    });
    kg += p.weight;
    // Candidate anchors: the 3 classic extreme points plus the other top-face
    // corners and the floor diagonal, so flat tops can be entered from any edge.
    const { x, y, z, l, w, h } = best;
    const next: [number, number, number][] = [
      [x + l, y, z],
      [x, y + w, z],
      [x, y, z + h],
      [x + l, y + w, z],
      [x + l, y, z + h],
      [x, y + w, z + h],
      [x + l, y + w, z + h],
    ];
    const seen = new Set<string>();
    points = [...points, ...next].filter(([px, py, pz]) => {
      if (px >= container.length || py >= container.width || pz >= container.height) return false;
      if (px > x && px < x + l && py > y && py < y + w && pz > z && pz < z + h) return false;
      const k = `${px},${py},${pz}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
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
