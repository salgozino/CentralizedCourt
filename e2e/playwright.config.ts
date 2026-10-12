import { defineConfig, devices } from '@playwright/test';

// The app (backend on a temp DB + Vite) is started by src/globalSetup.ts on free ports;
// specs get its URL through the `baseURL` fixture in src/fixtures.ts.
export default defineConfig({
  testDir: './tests',
  globalSetup: './src/globalSetup.ts',
  // One shared backend and DB: run specs one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
