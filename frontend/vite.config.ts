import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // xfwd appends the real client IP to X-Forwarded-For; the backend rate-limits
      // login per client IP and would otherwise see every request as 127.0.0.1.
      "/api": { target: "http://localhost:8000", xfwd: true },
    },
  },
  test: {
    environment: "jsdom",
    // The UI library imports its own CSS files, which only Vite can process.
    server: { deps: { inline: ["@kleros/ui-components-library"] } },
  },
});
