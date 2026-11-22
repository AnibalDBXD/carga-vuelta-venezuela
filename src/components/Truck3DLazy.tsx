import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type TruckType from "./Truck3D";
import { VehicleThumb } from "./VehicleThumb";

const Truck3D = lazy(() => import("./Truck3D"));

export function Truck3DView(props: ComponentProps<typeof TruckType>) {
  // Silueta plana del mismo vehículo como placeholder: transparente y sin marco,
  // igual que el canvas que la reemplaza.
  const fallback = (
    <div className={`${props.className ?? ""} grid place-items-center`}>
      <VehicleThumb kind={props.kind} decorative className="h-1/2 w-2/3 animate-pulse opacity-30" />
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
