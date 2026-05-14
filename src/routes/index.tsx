import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/saffron-and-smoke.html"
      title="Saffron & Smoke"
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
