// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/** Website Admin loads `/?websiteId=&wa_preview=1` — SSR root 500s; serve static template instead. */
function websiteAdminPreviewRedirect(): Plugin {
  return {
    name: "website-admin-preview-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || "/";
        const pathOnly = raw.split("?")[0] || "/";
        if (pathOnly !== "/" && pathOnly !== "") {
          next();
          return;
        }
        const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
        const isPreview =
          qs.includes("wa_preview=1") ||
          qs.includes("websiteId=") ||
          qs.includes("apiBase=");
        if (!isPreview) {
          next();
          return;
        }
        res.statusCode = 302;
        res.setHeader("Location", `/saffron-and-smoke.html${qs}`);
        res.end();
      });
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [websiteAdminPreviewRedirect()],
    server: {
      port: 5000,
      strictPort: true,
    },
    preview: {
      port: 5000,
      strictPort: true,
    },
  },
});
