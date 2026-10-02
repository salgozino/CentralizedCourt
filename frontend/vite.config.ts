import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    server: { deps: { inline: ['@kleros/ui-components-library'] } },
  },
  server: {
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
