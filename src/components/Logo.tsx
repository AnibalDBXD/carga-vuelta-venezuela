import { cn } from "@/lib/utils";

/**
 * Símbolo de marca: carretera en curva con línea central discontinua.
 * Geometría y reglas en design.md §1.1.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <g fill="none" strokeLinecap="round">
        <path
          d="M21 58A37 37 0 0 1 58 21"
          stroke="currentColor"
          strokeWidth="5.6"
          className="text-primary"
        />
        <path
          d="M43 58A15 15 0 0 1 58 43"
          stroke="currentColor"
          strokeWidth="5.6"
          className="text-primary"
        />
        <path
          d="M32 58A26 26 0 0 1 58 32"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinecap="butt"
          strokeDasharray="9 6.92"
          className="text-foreground"
        />
      </g>
    </svg>
  );
}

/**
 * Wordmark. La versión web usa Saira Stencil One (equivalente libre de Stencil).
 * Ver design.md §1.2 y §3.1.
 */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-brand text-[1.0625rem] uppercase leading-none tracking-[0.03em]",
        className,
      )}
    >
      <span className="text-foreground">Carga</span>
      <span className="text-primary">Ruta</span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <LogoWordmark />
    </span>
  );
}
