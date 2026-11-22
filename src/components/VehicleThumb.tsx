import { VEHICLE_PRESETS, type VehicleKind } from "@/lib/venezuela";

/**
 * Miniatura del tipo de vehículo: silueta lateral plana, cabina amarilla y
 * carrocería en blanco de borde, sobre lienzo 240 × 120.
 */
const TRUCKS: Record<
  Exclude<VehicleKind, "auto">,
  {
    cabW: number;
    cabH: number;
    boxW: number;
    boxH: number;
    bed?: boolean;
    gap?: number;
    third?: boolean;
  }
> = {
  pickup: { cabW: 48, cabH: 36, boxW: 66, boxH: 26, bed: true },
  // Van de techo alto: cabina y caja comparten altura para una silueta de una sola pieza.
  furgon: { cabW: 36, cabH: 54, boxW: 106, boxH: 54 },
  camion350: { cabW: 34, cabH: 42, boxW: 108, boxH: 60 },
  camion750: { cabW: 36, cabH: 48, boxW: 118, boxH: 64 },
  gandola: { cabW: 38, cabH: 48, boxW: 126, boxH: 64, gap: 10, third: true },
};

const GROUND = 100;
const WHEEL_R = 9;
const X0 = 14;

export function VehicleThumb({
  kind,
  className,
  decorative = false,
}: {
  kind: VehicleKind;
  className?: string;
  /** Oculta la miniatura a lectores de pantalla cuando el texto ya nombra el tipo. */
  decorative?: boolean;
}) {
  const label = VEHICLE_PRESETS[kind]?.label ?? "Vehículo de carga";
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label };

  if (kind === "auto") {
    return (
      <svg viewBox="0 30 240 80" {...a11y} className={className}>
        <g transform="translate(-3 0)">
          <path
            d="M48 90 L52 74 Q54 66 64 64 L92 60 L108 46 Q112 42 120 42 L146 42 Q152 42 156 46 L168 60 L188 64 Q196 66 196 74 L198 90 Z"
            fill="var(--foreground)"
            opacity="0.9"
          />
          <path
            d="M96 58 L112 48 Q114 46 118 46 L144 46 Q147 46 149 48 L160 58 Z"
            fill="var(--background)"
            opacity="0.55"
          />
          <circle
            cx="82"
            cy="90"
            r="10"
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth="4"
          />
          <circle
            cx="168"
            cy="90"
            r="10"
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth="4"
          />
        </g>
      </svg>
    );
  }

  const t = TRUCKS[kind] ?? TRUCKS.camion350;
  const cabX1 = X0 + t.cabW;
  const boxX0 = cabX1 + (t.gap ?? 0);
  const boxX1 = boxX0 + t.boxW;
  const cabTop = GROUND - t.cabH;
  const boxTop = GROUND - t.boxH;
  const wheel1 = X0 + t.cabW * 0.55;
  const wheel2 = boxX0 + t.boxW * (t.third ? 0.62 : 0.72);
  const wheel3 = boxX1 - 14;
  // Centra la silueta (cada tipo tiene un ancho distinto) sin cambiar su escala relativa.
  const shift = (240 - (boxX1 - X0)) / 2 - X0;

  return (
    <svg viewBox="0 30 240 80" {...a11y} className={className}>
      <g transform={`translate(${shift} 0)`}>
        {/* cabina: el frente mira a la izquierda, con el parabrisas inclinado hacia atrás */}
        <path
          d={`M${X0} ${GROUND} L${X0} ${cabTop + 11} L${X0 + 7} ${cabTop} L${cabX1} ${cabTop} L${cabX1} ${GROUND} Z`}
          fill="var(--primary)"
        />
        <path
          d={`M${X0 + 4} ${cabTop + 17} L${X0 + 11} ${cabTop + 5} L${cabX1 - 6} ${cabTop + 5} L${cabX1 - 6} ${cabTop + 17} Z`}
          fill="var(--background)"
          opacity="0.65"
        />
        {/* carrocería */}
        {t.bed ? (
          <>
            {/* cama abierta: baranda, piso, compuerta y mamparo */}
            <rect
              x={boxX0}
              y={GROUND - t.boxH}
              width={t.boxW}
              height="6"
              fill="var(--foreground)"
              opacity="0.9"
            />
            <rect
              x={boxX0}
              y={GROUND - 6}
              width={t.boxW}
              height="6"
              fill="var(--foreground)"
              opacity="0.9"
            />
            <rect
              x={boxX1 - 6}
              y={GROUND - t.boxH}
              width="6"
              height={t.boxH}
              fill="var(--foreground)"
              opacity="0.9"
            />
            <rect
              x={boxX0}
              y={GROUND - t.boxH}
              width="4"
              height={t.boxH}
              fill="var(--foreground)"
              opacity="0.55"
            />
          </>
        ) : (
          <>
            <rect
              x={boxX0}
              y={boxTop}
              width={t.boxW}
              height={t.boxH}
              fill="var(--foreground)"
              opacity="0.9"
            />
            <rect
              x={boxX0 + 8}
              y={boxTop + 8}
              width={t.boxW - 16}
              height="2"
              fill="var(--background)"
              opacity="0.18"
            />
          </>
        )}
        {/* ruedas */}
        {[wheel1, wheel2, ...(t.third ? [wheel3] : [])].map((cx, i) => (
          <circle
            key={i}
            cx={cx}
            cy={GROUND}
            r={WHEEL_R}
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth="4"
          />
        ))}
      </g>
    </svg>
  );
}
