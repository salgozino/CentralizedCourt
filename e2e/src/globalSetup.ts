import { startApp, stopApp } from './servers';

/** Starts backend + Vite once per run; the returned function is Playwright's teardown. */
export default async function globalSetup(): Promise<() => void> {
  const app = await startApp();
  // Test workers inherit the environment, so this is how specs find the app.
  process.env.E2E_BASE_URL = app.baseUrl;
  process.env.E2E_STDOUT_FILE = app.stdoutFile;
  return () => stopApp(app);
}
