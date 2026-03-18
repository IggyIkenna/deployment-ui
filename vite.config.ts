import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  cacheDir: path.resolve(__dirname, "node_modules/.vite"),
  define: {
    "import.meta.env.VITE_MOCK_API": JSON.stringify("true"),
    "import.meta.env.VITE_SKIP_AUTH": JSON.stringify("true"),
  },
  optimizeDeps: {
    force: true,
    entries: ["./src/main.tsx"],
  },
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    hmr: {
      overlay: true,
    },
  },
  build: {
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
});
