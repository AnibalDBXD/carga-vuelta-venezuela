import { Skeleton } from "@/components/ui/skeleton";

// Pantalla genérica mientras un loader de ruta resuelve (auth de _authenticated,
// redirect de /recogidas y cualquier ruta sin pendingComponent propio).
export function DefaultPending() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10" aria-hidden="true">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    </main>
  );
}
