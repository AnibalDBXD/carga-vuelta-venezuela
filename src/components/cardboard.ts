import { CanvasTexture, SRGBColorSpace, type Texture } from "three";

// Texturas de cartón generadas en canvas (sin assets). Solo se usa desde
// Truck3D, que carga en cliente vía Truck3DLazy — nunca tocar document en
// top-level.
const SIZE = 256;
const KRAFT = "#c79c66";
const FRAGILE_RED = "#b3202c";

export type BoxTextureSet = { side: Texture; top: Texture; bottom: Texture };

const cache = new Map<string, BoxTextureSet>();
let sharedBottom: Texture | null = null;

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  return [c, c.getContext("2d")!] as const;
}

function toTexture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Cartón kraft: grano de papel, estrías suaves y viñeta en los bordes. */
function paintCardboard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = KRAFT;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(96,66,34,0.08)" : "rgba(255,235,205,0.07)";
    const s = 1 + Math.random() * 2;
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, s, s);
  }
  ctx.fillStyle = "rgba(90,60,30,0.05)";
  for (let y = 8; y < SIZE; y += 14) ctx.fillRect(0, y, SIZE, 1);
  const g = ctx.createRadialGradient(
    SIZE / 2,
    SIZE / 2,
    SIZE * 0.35,
    SIZE / 2,
    SIZE / 2,
    SIZE * 0.78,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(60,40,18,0.18)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

/** Cinta de embalar del color del bulto (con brillo). */
function paintTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  if (h > w) {
    ctx.fillRect(x + w * 0.18, y, 2, h);
    ctx.fillRect(x + w * 0.78, y, 1, h);
  } else {
    ctx.fillRect(x, y + h * 0.2, w, 2);
    ctx.fillRect(x, y + h * 0.76, w, 1);
  }
  ctx.restore();
}

/** Etiqueta blanca de FRÁGIL con borde rojo. */
function paintFragileLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = FRAGILE_RED;
  ctx.lineWidth = 4;
  ctx.strokeRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6);
  ctx.fillStyle = FRAGILE_RED;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(h * 0.4)}px monospace`;
  ctx.fillText("FRÁGIL", cx, cy - h * 0.13);
  ctx.font = `bold ${Math.round(h * 0.3)}px monospace`;
  ctx.fillText("↑↑", cx, cy + h * 0.27);
}

function makeSide(color: string, fragile: boolean) {
  const [c, ctx] = makeCanvas();
  paintCardboard(ctx);
  paintTape(ctx, 0, 0, SIZE, SIZE * 0.16, color);
  ctx.fillStyle = "rgba(60,40,18,0.25)";
  ctx.fillRect(0, SIZE * 0.16, SIZE, 2);
  if (fragile) paintFragileLabel(ctx, SIZE / 2, SIZE * 0.58, SIZE * 0.64, SIZE * 0.34);
  return toTexture(c);
}

function makeTop(color: string, fragile: boolean) {
  const [c, ctx] = makeCanvas();
  paintCardboard(ctx);
  ctx.fillStyle = "rgba(60,40,18,0.5)";
  ctx.fillRect(SIZE / 2 - 2, 0, 4, SIZE);
  paintTape(ctx, SIZE / 2 - SIZE * 0.11, 0, SIZE * 0.22, SIZE, color);
  if (fragile) paintFragileLabel(ctx, SIZE * 0.24, SIZE * 0.5, SIZE * 0.36, SIZE * 0.3);
  return toTexture(c);
}

/**
 * Texturas de caja de cartón por color de bulto. Cacheadas: la paleta tiene 8
 * colores, así que hay como máximo 16 sets (la cara inferior es compartida).
 */
export function boxTextures(color: string, fragile: boolean): BoxTextureSet {
  const key = `${color}|${fragile}`;
  let set = cache.get(key);
  if (!set) {
    sharedBottom ??= (() => {
      const [c, ctx] = makeCanvas();
      paintCardboard(ctx);
      return toTexture(c);
    })();
    set = { side: makeSide(color, fragile), top: makeTop(color, fragile), bottom: sharedBottom };
    cache.set(key, set);
  }
  return set;
}
