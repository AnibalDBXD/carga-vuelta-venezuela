// Tasa oficial USD→Bs del BCV, consultada solo desde el servidor (specs/001-pago-movil.md).

const TTL_MS = 60 * 60 * 1000;
let cache: { rate: number; fetchedAt: string } | undefined;
let pending: Promise<{ rate: number; fetchedAt: string }> | undefined;

/** Extrae la tasa USD del HTML de bcv.org.ve (bloque id="dolar", decimales con coma). */
export function parseBcvRate(html: string): number | null {
  const match = /id="dolar"[^>]*>[\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i.exec(html);
  if (!match?.[1]) return null;
  const rate = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function envFallback(): number | null {
  if (typeof process === "undefined") return null;
  const rate = Number(process.env["BCV_FALLBACK_RATE"]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function getBcvRate(): Promise<{ rate: number; fetchedAt: string }> {
  // BCV_FALLBACK_RATE definida fija la tasa (demo/desarrollo); vacía consulta bcv.org.ve.
  const pinned = envFallback();
  if (pinned) return { rate: pinned, fetchedAt: new Date().toISOString() };
  if (cache && Date.now() - Date.parse(cache.fetchedAt) < TTL_MS) return cache;
  pending ??= (async () => {
    try {
      const res = await fetch("https://www.bcv.org.ve/", { signal: AbortSignal.timeout(8000) });
      const rate = parseBcvRate(await res.text());
      if (!rate) throw new Error("tasa no encontrada");
      cache = { rate, fetchedAt: new Date().toISOString() };
    } catch {
      if (!cache) throw new Error("No se pudo obtener la tasa BCV");
    } finally {
      pending = undefined;
    }
    return cache!;
  })();
  return pending;
}
