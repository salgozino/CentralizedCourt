import { stopBackend } from './backend';

export default async function globalTeardown(): Promise<void> {
  const backend = globalThis.__CONTRACT_BACKEND__;
  if (backend) stopBackend(backend);
}
