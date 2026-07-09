import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiKitSrc = path.resolve(__dirname, "../unified-trading-ui-kit/src");

export default defineConfig(({ mode }) => ({
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias:
      mode === "development"
        ? [
            {
              find: "@unified-trading/ui-kit/globals.css",
              replacement: path.join(uiKitSrc, "globals.css"),
            },
            {
              find: "@unified-trading/ui-kit",
              replacement: path.join(uiKitSrc, "index.ts"),
            },
          ]
        : undefined,
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    hmr: {
      overlay: true,
      timeout: 5000,
    },
    watch: {
      usePolling: false,
      ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    },
    proxy: {
      "/api": {
        // Default: local deployment-api (SSOT: ui-api-mapping.json — deployment-api port).
        // Override VITE_PROXY_TARGET to point dev at a live backend (e.g. the deployed
        // Cloud Run API) without hitting browser CORS — the proxy fetches server-side.
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8004",
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["tests/unit/setup.ts"],
    server: {
      deps: {
        inline: [/clsx/, /tailwind-merge/],
      },
    },
  },
}));
