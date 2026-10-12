import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: false,
    server: { deps: { inline: [/@kleros\/ui-components-library/] } },
  },
  server: {
    proxy: {
      // API_PROXY_TARGET lets the e2e suite point Vite at its own backend.
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000', xfwd: true },
    },
  },
});
