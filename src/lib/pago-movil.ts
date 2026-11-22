// Datos y formato de pago móvil venezolano (specs/001-pago-movil.md).

export type PagoMovil = { bank: string; phone: string; document: string; holder: string };

export const BANKS: { code: string; name: string }[] = [
  { code: "0102", name: "Banco de Venezuela" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0105", name: "Banco Mercantil" },
  { code: "0108", name: "Banco Provincial" },
  { code: "0114", name: "Bancaribe" },
  { code: "0115", name: "Banco Exterior" },
  { code: "0128", name: "Banco Caroní" },
  { code: "0134", name: "Banesco" },
  { code: "0137", name: "Banco Sofitasa" },
  { code: "0138", name: "Banco Plaza" },
  { code: "0146", name: "Banco de la Gente Emprendedora" },
  { code: "0151", name: "BFC Banco Fondo Común" },
  { code: "0156", name: "100% Banco" },
  { code: "0157", name: "DelSur Banco Universal" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0166", name: "Banco Agrícola de Venezuela" },
  { code: "0168", name: "Bancrecer" },
  { code: "0169", name: "Mi Banco" },
  { code: "0171", name: "Banco Activo" },
  { code: "0172", name: "Bancamiga" },
  { code: "0173", name: "Banco Internacional de Desarrollo" },
  { code: "0174", name: "Banplus" },
  { code: "0175", name: "Banco Bicentenario" },
  { code: "0177", name: "Banco de la Fuerza Armada (Banfanb)" },
  { code: "0191", name: "BNC Banco Nacional de Crédito" },
];

export const bankName = (code: string) => BANKS.find((b) => b.code === code)?.name ?? code;

const money = (n: number) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatUsd = (n: number) => money(n);
export const formatBs = (n: number) => money(n);

/** Carga del QR del MVP: banco|teléfono|documento|monto en Bs. El formato EMV interbancario queda pendiente. */
export function pagoMovilQrPayload(pm: PagoMovil, amountBs: number): string {
  return `${pm.bank}|${pm.phone}|${pm.document}|${amountBs.toFixed(2)}`;
}
