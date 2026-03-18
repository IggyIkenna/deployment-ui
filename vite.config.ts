import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => ({
  // Force fresh cache to avoid stale builds
  cacheDir: "node_modules/.vite-deployment-ui",
  define: {
    // Enable mock mode by default for development/preview
    "import.meta.env.VITE_MOCK_API": JSON.stringify("true"),
    "import.meta.env.VITE_SKIP_AUTH": JSON.stringify("true"),
  },
  optimizeDeps: {
    // Force re-bundling of dependencies
    force: true,
  },
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    // Disable proxy when mock mode is enabled
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
