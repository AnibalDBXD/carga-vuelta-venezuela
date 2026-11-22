import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/retornos")({
  beforeLoad: () => {
    throw redirect({ to: "/bolsa" });
  },
});
