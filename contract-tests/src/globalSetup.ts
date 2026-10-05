import { RunningBackend, startBackend } from './backend';

declare global {
  var __CONTRACT_BACKEND__: RunningBackend | undefined;
}

export default async function globalSetup(): Promise<void> {
  const backend = await startBackend();
  globalThis.__CONTRACT_BACKEND__ = backend;
  // Test workers inherit the environment, so this is how the suite finds the backend.
  process.env.CONTRACT_BASE_URL = backend.baseUrl;
  process.env.CONTRACT_STDOUT_FILE = backend.stdoutFile;
}
