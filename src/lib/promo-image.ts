import qrcode from "qrcode-generator";

export type PromoVehicle = {
  name: string;
  kindLabel: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxKg: number;
};

export type PromoData = {
  ownerName: string;
  url: string;
  originName: string;
  destinationName: string;
  date: string;
  departureTime?: string | undefined;
  stops: string[];
  vehicle: PromoVehicle;
  freeM3: number;
  freeKg: number;
  routeMapUrl?: string | undefined;
};

export const PROMO_FORMATS = {
  story: { label: "Historia / estado", width: 1080, height: 1920 },
  post: { label: "Publicación", width: 1080, height: 1350 },
} as const;
export type PromoFormat = keyof typeof PROMO_FORMATS;

const FALLBACK = {
  background: "#1e1f27",
  card: "#292a35",
  border: "#484a58",
  foreground: "#f4f4ec",
  muted: "#a8aabc",
  primary: "#ecc813",
};
type Colors = typeof FALLBACK;

function themeColors(): Colors {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const ok =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", "oklch(0.5 0.1 100)");
  const pick = (name: string, fb: string) => (ok ? s.getPropertyValue(name).trim() || fb : fb);
  return {
    background: pick("--background", FALLBACK.background),
    card: pick("--card", FALLBACK.card),
    border: pick("--border", FALLBACK.border),
    foreground: pick("--foreground", FALLBACK.foreground),
    muted: pick("--muted-foreground", FALLBACK.muted),
    primary: pick("--primary", FALLBACK.primary),
  };
}

const SANS = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const font = (w: number, px: number, family = SANS) => `${w} ${px}px ${family}`;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const c = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + c, y);
  ctx.arcTo(x + w, y, x + w, y + h, c);
  ctx.arcTo(x + w, y + h, x, y + h, c);
  ctx.arcTo(x, y + h, x, y, c);
  ctx.arcTo(x, y, x + w, y, c);
  ctx.closePath();
}

const TRUCK_PATHS = [
  "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
  "M15 18H9",
  "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
];

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of TRUCK_PATHS) ctx.stroke(new Path2D(d));
  for (const cx of [7, 17]) {
    ctx.beginPath();
    ctx.arc(cx, 18, 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHazardStripe(ctx: CanvasRenderingContext2D, w: number, h: number, c: Colors) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.background;
  const step = 56;
  for (let x = -h; x < w + h; x += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.lineTo(x + h + step / 2, h);
    ctx.lineTo(x + step / 2, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = color;
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(r, col))
        ctx.fillRect(
          x + (col + quiet) * cell,
          y + (r + quiet) * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
}

// fetch → blob → objectURL: si CORS responde bien, el <img> del blob no contamina el canvas.
async function loadMapImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const obj = URL.createObjectURL(await res.blob());
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("map image"));
        img.src = obj;
      });
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  }
}

export async function renderPromoCard(
  canvas: HTMLCanvasElement,
  data: PromoData,
  format: PromoFormat,
): Promise<void> {
  const { width: W, height: H } = PROMO_FORMATS[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all(
      ["400", "500", "700"].flatMap((w) => [
        document.fonts.load(`${w} 40px "Space Grotesk"`),
        document.fonts.load(`${w} 40px "IBM Plex Mono"`),
      ]),
    ).catch(() => {});
  }
  const c = themeColors();
  const mapImg = data.routeMapUrl ? await loadMapImage(data.routeMapUrl) : null;
  const M = 72;
  const CW = W - M * 2;
  ctx.textBaseline = "top";

  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;
  for (let x = 96; x < W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let gy = 96; gy < H; gy += 96) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawHazardStripe(ctx, W, 26, c);
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  drawHazardStripe(ctx, W, 26, c);
  ctx.restore();

  const mono = (w: number, px: number) => font(w, px, MONO);
  const measure = (s: string) => ctx.measureText(s).width;

  const logoSize = 96;
  const single = `${data.originName} → ${data.destinationName}`;
  let routePx = 156;
  ctx.font = font(700, routePx);
  while (routePx > 96 && measure(single) > CW) {
    routePx -= 10;
    ctx.font = font(700, routePx);
  }
  const routeLines =
    measure(single) <= CW ? [single] : [`${data.originName} →`, data.destinationName];
  if (routeLines.length === 2) {
    routePx = 110;
    ctx.font = font(700, routePx);
    while (routePx > 64 && (measure(routeLines[0]!) > CW || measure(routeLines[1]!) > CW)) {
      routePx -= 6;
      ctx.font = font(700, routePx);
    }
  }
  const routeLH = Math.round(routePx * 1.05);

  const big = format === "story";
  const vehicleCardH = big ? 300 : 290;
  const qrSize = big ? 340 : 300;
  const stops = data.stops.filter(Boolean);
  const waypoints = [data.originName, ...stops, data.destinationName];
  const diagH = big ? 170 : 150;

  const when = `Sale el ${data.date}${data.departureTime ? ` a las ${data.departureTime}` : ""}`;
  const metaSingle = data.ownerName ? `${when} · Conduce ${data.ownerName}` : when;
  ctx.font = mono(400, 30);
  const metaLines =
    measure(metaSingle) <= CW || !data.ownerName
      ? [metaSingle]
      : [when, `Conduce ${data.ownerName}`];

  const sections: { h: number; draw: (y: number) => void }[] = [];

  sections.push({
    h: logoSize,
    draw: (y) => {
      roundRect(ctx, M, y, logoSize, logoSize, 22);
      ctx.fillStyle = c.primary;
      ctx.fill();
      drawTruck(ctx, M + 18, y + 18, logoSize - 36, c.background);
      ctx.fillStyle = c.foreground;
      ctx.font = font(700, 46);
      ctx.fillText("CargaRuta", M + logoSize + 28, y + 6);
      ctx.fillStyle = c.muted;
      ctx.font = mono(400, 28);
      ctx.fillText("carga de regreso en Venezuela", M + logoSize + 28, y + 62);
    },
  });

  sections.push({
    h: routeLines.length * routeLH + 24 + metaLines.length * 44,
    draw: (y) => {
      ctx.fillStyle = c.foreground;
      ctx.font = font(700, routePx);
      for (const line of routeLines) {
        ctx.fillText(line, M, y);
        y += routeLH;
      }
      y += 24;
      ctx.font = mono(400, 30);
      ctx.fillStyle = c.muted;
      for (const line of metaLines) {
        ctx.fillText(line, M, y + 14);
        y += 44;
      }
    },
  });

  const mapH = big ? 430 : 360;
  sections.push({
    h: mapImg ? mapH + 56 : diagH,
    draw: (y) => {
      if (mapImg) {
        roundRect(ctx, M, y, CW, mapH, 24);
        ctx.save();
        ctx.clip();
        const scale = Math.max(CW / mapImg.width, mapH / mapImg.height);
        const dw = mapImg.width * scale;
        const dh = mapImg.height * scale;
        ctx.drawImage(mapImg, M + (CW - dw) / 2, y + (mapH - dh) / 2, dw, dh);
        ctx.restore();
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 2;
        roundRect(ctx, M, y, CW, mapH, 24);
        ctx.stroke();
        ctx.font = mono(400, 20);
        ctx.fillStyle = c.muted;
        ctx.textAlign = "right";
        ctx.fillText("© Mapbox © OpenStreetMap", M + CW - 16, y + mapH - 34);
        ctx.font = mono(600, 26);
        ctx.textAlign = "center";
        ctx.fillText(waypoints.join(" · "), M + CW / 2, y + mapH + 16);
        ctx.textAlign = "left";
        return;
      }
      const midY = y + diagH / 2;
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 5;
      ctx.setLineDash([26, 20]);
      ctx.beginPath();
      ctx.moveTo(M, midY);
      ctx.lineTo(M + CW, midY);
      ctx.stroke();
      ctx.setLineDash([]);
      const last = waypoints.length - 1;
      // Las etiquetas de un mismo lado no pueden solaparse: reducir fuente
      // hasta que encajen, y truncar como último recurso.
      const labels = waypoints.map((name, i) => {
        const endpoint = i === 0 || i === last;
        const x = M + (CW * i) / last;
        return { name, i, x, endpoint, px: endpoint ? 30 : 26, up: i % 2 === 0 };
      });
      const rectOf = (l: (typeof labels)[number]) => {
        ctx.font = l.endpoint ? mono(700, l.px) : mono(600, l.px);
        const w = measure(l.name);
        const left = l.i === 0 ? l.x : l.i === last ? l.x - w : l.x - w / 2;
        return { left, right: left + w };
      };
      for (let pass = 0; pass < 40; pass++) {
        const rects = labels.map(rectOf);
        const clash = labels.find((l) => {
          const r = rects[l.i]!;
          const side = labels.filter((o) => o !== l && o.up === l.up);
          const out = l.i === 0 ? r.right > M + CW : l.i === last ? r.left < M : false;
          return (
            out ||
            side.some((o) => r.left < rects[o.i]!.right + 8 && rects[o.i]!.left < r.right + 8)
          );
        });
        if (!clash) break;
        const same = labels.filter((o) => o.up === clash.up);
        const wOf = (l: (typeof labels)[number]) => {
          ctx.font = l.endpoint ? mono(700, l.px) : mono(600, l.px);
          return measure(l.name);
        };
        const widest = same.reduce((a, b) => (wOf(a) >= wOf(b) ? a : b));
        const minPx = widest.endpoint ? 22 : 18;
        if (widest.px > minPx) widest.px -= 2;
        else if (widest.name.length > 4) widest.name = widest.name.slice(0, -2) + "…";
        else break;
      }
      labels.forEach((l) => {
        const endpoint = l.endpoint;
        ctx.beginPath();
        ctx.arc(l.x, midY, endpoint ? 16 : 11, 0, Math.PI * 2);
        ctx.fillStyle = endpoint ? c.primary : c.background;
        ctx.fill();
        if (!endpoint) {
          ctx.strokeStyle = c.primary;
          ctx.lineWidth = 5;
          ctx.stroke();
        }
        ctx.font = endpoint ? mono(700, l.px) : mono(600, l.px);
        ctx.fillStyle = endpoint ? c.foreground : c.muted;
        ctx.textAlign = l.i === 0 ? "left" : l.i === last ? "right" : "center";
        ctx.fillText(l.name, l.x, l.up ? midY - 52 : midY + 32);
        ctx.textAlign = "left";
      });
    },
  });

  sections.push({
    h: vehicleCardH,
    draw: (y) => {
      roundRect(ctx, M, y, CW, vehicleCardH, 24);
      ctx.fillStyle = c.card;
      ctx.fill();
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 2;
      ctx.stroke();
      const v = data.vehicle;
      const fitFont = (
        text: string,
        mk: (px: number) => string,
        px: number,
        maxW: number,
        min = 20,
      ) => {
        while (px > min) {
          ctx.font = mk(px);
          if (measure(text) <= maxW) break;
          px -= 2;
        }
        ctx.font = mk(px);
      };
      drawTruck(ctx, M + 36, y + 30, 56, c.primary);
      ctx.fillStyle = c.foreground;
      fitFont(v.name, (px) => font(700, px), 44, CW - 156);
      ctx.fillText(v.name, M + 120, y + 28);
      ctx.fillStyle = c.muted;
      const spec = `${v.kindLabel} · ${v.lengthCm}×${v.widthCm}×${v.heightCm} cm · máx ${v.maxKg.toLocaleString("es-VE")} kg`;
      fitFont(spec, (px) => mono(400, px), 27, CW - 156);
      ctx.fillText(spec, M + 120, y + 88);
      ctx.fillStyle = c.primary;
      fitFont(
        `${data.freeM3} m³ · ${data.freeKg.toLocaleString("es-VE")} kg libres`,
        (px) => font(700, px),
        48,
        CW - 72,
      );
      ctx.fillText(
        `${data.freeM3} m³ · ${data.freeKg.toLocaleString("es-VE")} kg libres`,
        M + 36,
        y + 142,
      );
      const volM3 = (v.lengthCm * v.widthCm * v.heightCm) / 1e6;
      const pct = volM3 > 0 ? Math.min(1, data.freeM3 / volM3) : 0;
      const barY = y + 236;
      ctx.fillStyle = c.muted;
      ctx.font = mono(600, 24);
      ctx.fillText(`${Math.round(pct * 100)}% DEL VOLUMEN LIBRE`, M + 36, y + 208);
      roundRect(ctx, M + 36, barY, CW - 72, 20, 10);
      ctx.fillStyle = c.border;
      ctx.fill();
      if (pct > 0.01) {
        roundRect(ctx, M + 36, barY, (CW - 72) * pct, 20, 10);
        ctx.fillStyle = c.primary;
        ctx.fill();
      }
    },
  });

  sections.push({
    h: qrSize,
    draw: (y) => {
      roundRect(ctx, M, y, qrSize, qrSize, 20);
      ctx.fillStyle = c.foreground;
      ctx.fill();
      drawQr(ctx, data.url, M + 10, y + 10, qrSize - 20, c.background);
      const tx = M + qrSize + 56;
      const ty = y + qrSize / 2 - 70;
      ctx.fillStyle = c.foreground;
      ctx.font = font(700, 44);
      ctx.fillText("Solicita tu espacio", tx, ty);
      ctx.fillStyle = c.muted;
      ctx.font = mono(400, 26);
      ctx.fillText("Escanea el QR con tu teléfono", tx, ty + 62);
      ctx.fillText("y pide la recogida", tx, ty + 96);
    },
  });

  const topPad = 40;
  const stripes = 52;
  const n = sections.length - 1;
  const used = sections.reduce((s, x) => s + x.h, 0);
  const avail = H - stripes - topPad * 2;
  const gap = Math.min(96, Math.max(24, (avail - used) / n));
  const leftover = Math.max(0, avail - used - gap * n);
  let y = 26 + topPad + leftover / 2;
  for (const section of sections) {
    section.draw(y);
    y += section.h + gap;
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
