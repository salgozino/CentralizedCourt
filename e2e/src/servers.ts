import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

export interface RunningApp {
  /** Vite dev server; it proxies `/api` to the backend, like `make dev-frontend`. */
  baseUrl: string;
  backendUrl: string;
  /** Backend stdout, where login codes are printed. */
  stdoutFile: string;
  tmpDir: string;
  children: ChildProcess[];
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECRET = 'e2e-dummy-secret-key';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function runToCompletion(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
}

function requireInstalled(dir: string): void {
  if (!fs.existsSync(path.join(dir, 'node_modules')))
    throw new Error(`Missing ${dir}/node_modules; run \`make setup\`.`);
}

/** Resolves once `url` answers with any HTTP status. */
async function waitUntilUp(url: string, child: ChildProcess, logFile: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${url} exited early (${child.exitCode}):\n${fs.readFileSync(logFile, 'utf8')}`);
    }
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`${url} did not respond within 60s:\n${fs.readFileSync(logFile, 'utf8')}`);
}

function startLogged(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logBase: string) {
  const stdoutFile = `${logBase}.stdout.log`;
  const stderrFile = `${logBase}.stderr.log`;
  // Own process group, so stopping `yarn vite` also stops the Vite process it spawns.
  const child = spawn(cmd, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', fs.openSync(stdoutFile, 'w'), fs.openSync(stderrFile, 'w')],
  });
  return { child, stdoutFile, stderrFile };
}

/** Builds the backend, runs it on a fresh seeded temp DB, then starts Vite against it. Both on free ports. */
export async function startApp(): Promise<RunningApp> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const children: ChildProcess[] = [];
  try {
    const backendDir = path.join(REPO_ROOT, 'backend');
    const frontendDir = path.join(REPO_ROOT, 'frontend');
    requireInstalled(backendDir);
    requireInstalled(frontendDir);

    const [backendPort, frontendPort] = [await freePort(), await freePort()];
    const backendUrl = `http://127.0.0.1:${backendPort}`;
    const backendEnv = {
      ...process.env,
      SECRET_KEY: SECRET,
      DEBUG: 'false',
      PORT: String(backendPort),
      DB_PATH: path.join(tmpDir, 'db.sqlite3'),
    };
    // Build once per run, so the suite always exercises the current sources.
    runToCompletion('yarn', ['build'], backendDir, process.env);
    runToCompletion(process.execPath, ['dist/cli/migrate.js'], backendDir, backendEnv);
    runToCompletion(process.execPath, ['dist/cli/seed.js'], backendDir, backendEnv);

    const backend = startLogged(
      process.execPath,
      ['dist/main.js'],
      backendDir,
      backendEnv,
      path.join(tmpDir, 'backend'),
    );
    children.push(backend.child);
    await waitUntilUp(`${backendUrl}/api/me`, backend.child, backend.stderrFile);

    const baseUrl = `http://127.0.0.1:${frontendPort}`;
    const frontend = startLogged(
      'yarn',
      ['vite', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
      frontendDir,
      { ...process.env, API_PROXY_TARGET: backendUrl },
      path.join(tmpDir, 'frontend'),
    );
    children.push(frontend.child);
    await waitUntilUp(baseUrl, frontend.child, frontend.stderrFile);

    return { baseUrl, backendUrl, stdoutFile: backend.stdoutFile, tmpDir, children };
  } catch (error) {
    stopApp({ tmpDir, children });
    throw error;
  }
}

export function stopApp({ tmpDir, children }: Pick<RunningApp, 'tmpDir' | 'children'>): void {
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
