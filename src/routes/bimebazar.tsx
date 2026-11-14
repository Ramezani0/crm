import { createFileRoute, redirect } from "@tanstack/react-router";

/** Menu alias — same hub as upgraded /premium-calc (additive). */
export const Route = createFileRoute("/bimebazar")({
  beforeLoad: () => {
    throw redirect({ to: "/premium-calc", replace: true });
  },
});
