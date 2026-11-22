import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Timestamp → "25 nov 14:30" (es-VE), para los hitos de seguimiento. */
export function formatWhen(ts: string): string {
  return new Date(ts).toLocaleString("es-VE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
