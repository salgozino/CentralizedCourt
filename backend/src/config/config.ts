import * as path from 'node:path';

export interface AppConfig {
  secretKey: string;
  dbPath: string;
  debug: boolean;
  port: number;
}

// Resolves to backend/db.sqlite3 from both src/ and dist/.
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', '..', 'db.sqlite3');

export function resolveDbPath(env: Record<string, unknown>): string {
  const raw = env.DB_PATH;
  return typeof raw === 'string' && raw.trim() !== '' ? path.resolve(raw) : DEFAULT_DB_PATH;
}

export function loadConfig(env: Record<string, unknown>): AppConfig {
  const secretKey = typeof env.SECRET_KEY === 'string' ? env.SECRET_KEY : '';
  if (secretKey.trim() === '') {
    throw new Error('SECRET_KEY environment variable is required (set it in the environment or in backend/.env)');
  }

  const rawPort = env.PORT;
  const port = rawPort === undefined || rawPort === '' ? 8000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${String(rawPort)}"`);
  }

  const debug = ['1', 'true', 'yes', 'on'].includes(String(env.DEBUG ?? '').toLowerCase());
  return { secretKey, dbPath: resolveDbPath(env), debug, port };
}
