import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
    defaultViewTransition: {
      // Types style the transition in styles.css (::view-transition). Search/hash-only
      // navigations (filters, anchors) stay instant; detail routes get a push/pop.
      types: ({ fromLocation, toLocation, pathChanged }) => {
        if (!pathChanged || !fromLocation) return false;
        const detail = /^\/(bolsa|pagos|vehiculos|viajes)\/[^/]+/;
        const from = detail.test(fromLocation.pathname);
        const to = detail.test(toLocation.pathname);
        if (to && !from) return ["to-detail"];
        if (from && !to) return ["from-detail"];
        return ["page"];
      },
    },
  });

  return router;
};
