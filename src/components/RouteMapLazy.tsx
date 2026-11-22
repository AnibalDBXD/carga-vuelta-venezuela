import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type RouteMapType from "./RouteMap";

const RouteMap = lazy(() => import("./RouteMap"));

export function RouteMapView(props: ComponentProps<typeof RouteMapType>) {
  const hasToken = Boolean(import.meta.env["VITE_MAPBOX_TOKEN"]);
  const fallback = (
    <div
      className={`${props.className ?? ""} grid place-items-center rounded-lg border border-border bg-card text-sm text-muted-foreground`}
    >
      {hasToken ? "Cargando mapa…" : "Mapa no disponible"}
    </div>
  );
  if (!hasToken) return fallback;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <RouteMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
