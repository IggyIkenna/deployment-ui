import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Force unique cache identifier to bust stale sandbox caches
const CACHE_BUSTER = Date.now();

export default defineConfig(() => ({
  // Unique cache directory to avoid stale builds
  cacheDir: `node_modules/.vite-deployment-ui-${CACHE_BUSTER}`,
  define: {
    // Enable mock mode by default for development/preview
    "import.meta.env.VITE_MOCK_API": JSON.stringify("true"),
    "import.meta.env.VITE_SKIP_AUTH": JSON.stringify("true"),
  },
  optimizeDeps: {
    // Force re-bundling of dependencies on every restart
    force: true,
    // Exclude problematic packages that might cause cache issues
    exclude: [],
  },
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    // Clear module graph on file changes
    hmr: {
      overlay: true,
    },
  },
  build: {
    // Ensure clean builds
    emptyOutDir: true,
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
