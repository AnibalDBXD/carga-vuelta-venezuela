import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type RouteMapType from "./RouteMap";
import { Skeleton } from "@/components/ui/skeleton";

const RouteMap = lazy(() => import("./RouteMap"));

export function RouteMapView(props: ComponentProps<typeof RouteMapType>) {
  const hasToken = Boolean(import.meta.env["VITE_MAPBOX_TOKEN"]);
  if (!hasToken)
    return (
      <div
        className={`${props.className ?? ""} grid place-items-center rounded-lg border border-border bg-card text-sm text-muted-foreground`}
      >
        Mapa no disponible
      </div>
    );
  const fallback = (
    <Skeleton className={`${props.className ?? ""} grid place-items-center`}>
      <MapPin className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
    </Skeleton>
  );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <RouteMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
