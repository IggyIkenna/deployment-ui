import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8004",
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
});
