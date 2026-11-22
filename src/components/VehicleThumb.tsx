import type { VehicleKind } from "@/lib/venezuela";

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
  furgon: { cabW: 26, cabH: 40, boxW: 116, boxH: 54 },
  camion350: { cabW: 34, cabH: 42, boxW: 108, boxH: 60 },
  camion750: { cabW: 36, cabH: 46, boxW: 118, boxH: 58 },
  gandola: { cabW: 38, cabH: 48, boxW: 126, boxH: 64, gap: 10, third: true },
};

const GROUND = 100;
const WHEEL_R = 9;
const X0 = 14;

export function VehicleThumb({ kind, className }: { kind: VehicleKind; className?: string }) {
  if (kind === "auto") {
    return (
      <svg viewBox="0 30 240 80" role="img" aria-label="Auto" className={className}>
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
  const wheel2 = boxX0 + t.boxW * 0.72;
  const wheel3 = boxX1 - 12;

  return (
    <svg viewBox="0 30 240 80" role="img" aria-label="Vehículo de carga" className={className}>
      {/* cabina */}
      <path
        d={`M${X0} ${GROUND} L${X0} ${cabTop} L${cabX1 - 7} ${cabTop} L${cabX1} ${cabTop + 11} L${cabX1} ${GROUND} Z`}
        fill="var(--primary)"
      />
      <path
        d={`M${X0 + 6} ${cabTop + 6} L${cabX1 - 10} ${cabTop + 6} L${cabX1 - 5} ${cabTop + 16} L${X0 + 6} ${cabTop + 16} Z`}
        fill="var(--background)"
        opacity="0.65"
      />
      {/* carrocería */}
      {t.bed ? (
        <>
          <rect
            x={boxX0}
            y={GROUND - t.boxH}
            width={t.boxW}
            height={t.boxH}
            fill="var(--foreground)"
            opacity="0.9"
          />
          <rect
            x={boxX0}
            y={GROUND - t.boxH}
            width={t.boxW}
            height="5"
            fill="var(--background)"
            opacity="0.25"
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
    </svg>
  );
}
