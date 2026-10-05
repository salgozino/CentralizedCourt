import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

export interface RunningBackend {
  baseUrl: string;
  stdoutFile: string;
  stderrFile: string;
  tmpDir: string;
  child: ChildProcess;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SECRET = 'contract-tests-dummy-secret-key';

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

async function waitUntilUp(baseUrl: string, child: ChildProcess, stderrFile: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early (${child.exitCode}):\n${fs.readFileSync(stderrFile, 'utf8')}`);
    }
    try {
      await fetch(`${baseUrl}/api/me`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Backend did not respond within 30s:\n${fs.readFileSync(stderrFile, 'utf8')}`);
}

function startDjango(port: number, dbPath: string): { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; prepare: string[][] } {
  const cwd = path.join(REPO_ROOT, 'backend');
  const python = path.join(cwd, '.venv', 'bin', 'python');
  if (!fs.existsSync(python)) throw new Error(`Missing ${python}; run \`make setup\` first.`);
  const env = {
    ...process.env,
    DJANGO_SECRET_KEY: SECRET,
    DJANGO_DEBUG: 'false',
    // Overlay that only adds ALLOWED_HOSTS, so the suite can run with DEBUG off like production.
    DJANGO_SETTINGS_MODULE: 'contract_settings',
    PYTHONPATH: path.join(__dirname, '..', 'django-harness'),
    DJANGO_DB_PATH: dbPath,
    PYTHONUNBUFFERED: '1',
  };
  return {
    cmd: python,
    args: ['manage.py', 'runserver', '--noreload', `127.0.0.1:${port}`],
    cwd,
    env,
    prepare: [
      ['manage.py', 'migrate', '--noinput'],
      ['manage.py', 'seed'],
    ],
  };
}

function startNest(): never {
  // Filled in once backend-nest/ exists (Task 2+): migrate, seed, then start on PORT with DB at the temp path.
  throw new Error('CONTRACT_BACKEND=nest is not implemented yet');
}

export async function startBackend(): Promise<RunningBackend> {
  const kind = process.env.CONTRACT_BACKEND ?? 'django';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-tests-'));
  const dbPath = path.join(tmpDir, 'db.sqlite3');
  const stdoutFile = path.join(tmpDir, 'stdout.log');
  const stderrFile = path.join(tmpDir, 'stderr.log');
  const port = await freePort();

  if (kind === 'nest') startNest();
  if (kind !== 'django') throw new Error(`Unknown CONTRACT_BACKEND "${kind}" (expected django or nest)`);

  try {
    const spec = startDjango(port, dbPath);
    for (const args of spec.prepare) runToCompletion(spec.cmd, args, spec.cwd, spec.env);

    const out = fs.openSync(stdoutFile, 'w');
    const err = fs.openSync(stderrFile, 'w');
    const child = spawn(spec.cmd, spec.args, { cwd: spec.cwd, env: spec.env, stdio: ['ignore', out, err] });
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await waitUntilUp(baseUrl, child, stderrFile);
    } catch (error) {
      child.kill('SIGTERM');
      throw error;
    }
    return { baseUrl, stdoutFile, stderrFile, tmpDir, child };
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

export function stopBackend(backend: RunningBackend): void {
  backend.child.kill('SIGTERM');
  fs.rmSync(backend.tmpDir, { recursive: true, force: true });
}
