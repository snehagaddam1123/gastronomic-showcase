import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeSrc = useMemo(() => {
    if (typeof window === "undefined") return "/saffron-and-smoke.html";
    const qs = window.location.search || "";
    return `/saffron-and-smoke.html${qs}`;
  }, []);

  useEffect(() => {
    const relayActions = new Set([
      "SET_WEBSITE_ID",
      "SET_USER_WEBSITE_ID",
      "REFRESH_TEMPLATE_DATA",
      "SET_API_BASE",
      "APPLY_PREVIEW_SNAPSHOT",
      "PREVIEW_NAVIGATE",
    ]);
    const relay = (event: MessageEvent) => {
      const action = event.data?.action;
      const innerWin = iframeRef.current?.contentWindow;
      const fromInner = innerWin && event.source === innerWin;
      const fromParent = event.source === window.parent;

      if (fromParent && relayActions.has(action)) {
        innerWin?.postMessage(event.data, "*");
        return;
      }
      if (fromInner && action === "PREVIEW_BRIDGE_READY" && window.parent !== window) {
        window.parent.postMessage(event.data, "*");
      }
    };
    window.addEventListener("message", relay);
    return () => window.removeEventListener("message", relay);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      title="Saffron & Smoke"
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
