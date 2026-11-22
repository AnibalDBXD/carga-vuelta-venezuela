import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type TruckType from "./Truck3D";

const Truck3D = lazy(() => import("./Truck3D"));

export function Truck3DView(props: ComponentProps<typeof TruckType>) {
  const fallback = (
    <div
      className={`${props.className ?? ""} grid place-items-center text-sm text-muted-foreground`}
    >
      Cargando modelo 3D…
    </div>
  );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Truck3D {...props} />
      </Suspense>
    </ClientOnly>
  );
}
export const BOX_COLORS = [
  "#f2c230",
  "#4aa3df",
  "#5cc88a",
  "#e57a44",
  "#c86bd4",
  "#e0e0e0",
  "#ff6b6b",
  "#8fd3c8",
];
