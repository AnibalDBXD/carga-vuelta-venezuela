import { describe, expect, it } from "vitest";
import { parseBcvRate } from "./bcv";
import { formatBs, formatUsd, pagoMovilQrPayload, bankName } from "./pago-movil";

describe("tasa BCV", () => {
  it('extrae la tasa USD del bloque id="dolar" con decimales en coma', () => {
    const html = '<div id="dolar" class="centrado"><strong> 301,452100  </strong></div>';
    expect(parseBcvRate(html)).toBeCloseTo(301.4521);
  });
  it("tolera separadores de miles con punto", () => {
    expect(parseBcvRate('<div id="dolar"><strong>1.234,56</strong></div>')).toBeCloseTo(1234.56);
  });
  it("devuelve null si no encuentra la tasa o no es positiva", () => {
    expect(parseBcvRate("<p>sin tasa</p>")).toBeNull();
    expect(parseBcvRate('<div id="dolar"><strong>0</strong></div>')).toBeNull();
    expect(parseBcvRate("")).toBeNull();
  });
});

describe("pago móvil", () => {
  it("arma la carga del QR con banco, teléfono, documento y monto en Bs", () => {
    const payload = pagoMovilQrPayload(
      { bank: "0102", phone: "04121234567", document: "V-12345678", holder: "Ana" },
      7536.3,
    );
    expect(payload).toBe("0102|04121234567|V-12345678|7536.30");
  });
  it("formatea montos con dos decimales estilo es-VE", () => {
    expect(formatUsd(25)).toBe("25,00");
    expect(formatBs(7536.3)).toContain("7.536,30");
  });
  it("resuelve el nombre del banco por código", () => {
    expect(bankName("0102")).toBe("Banco de Venezuela");
    expect(bankName("9999")).toBe("9999");
  });
});
