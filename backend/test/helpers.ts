import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { APP_OPTIONS, configureApp } from '../src/app';
import { dataSourceOptions } from '../src/data-source';
import { seedUsers } from '../src/seed/seed';

export function tempDbPath(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-test-'));
  return { dir, dbPath: path.join(dir, 'db.sqlite3') };
}

export async function migratedDataSource(dbPath: string): Promise<DataSource> {
  const dataSource = new DataSource(dataSourceOptions(dbPath));
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

// ---------------------------------------------------------------------------
// HTTP-level helpers: boot the whole app on a temp DB and drive it like a browser.
// ---------------------------------------------------------------------------

export interface BootedApp {
  app: INestApplication;
  dataSource: DataSource;
  /** Everything written to process.stdout since boot (login codes included). */
  stdout: string[];
  close(): Promise<void>;
}

export interface BootOptions {
  imports?: ModuleMetadata['imports'];
  controllers?: ModuleMetadata['controllers'];
}

export async function bootApp(extra: BootOptions = {}): Promise<BootedApp> {
  const { dir, dbPath } = tempDbPath();
  const saved = { ...process.env };
  process.env.SECRET_KEY = 'test-secret';
  process.env.DB_PATH = dbPath;
  // ConfigModule.forRoot validates while app.module is imported, so env must be set first.
  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(extra.imports ?? [])],
    controllers: extra.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication(APP_OPTIONS);
  configureApp(app);
  await app.init();
  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();
  await seedUsers(dataSource);

  const stdout: string[] = [];
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  return {
    app,
    dataSource,
    stdout,
    async close() {
      spy.mockRestore();
      await app.close();
      process.env = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface RequestOptions {
  raw?: string;
  headers?: Record<string, string>;
  /** Send X-CSRFToken from the jar (default: true for unsafe methods). */
  csrf?: boolean;
  /** Origin header; `null` sends none. Defaults to the trusted dev origin. */
  origin?: string | null;
  /** Replaces the whole cookie jar for this request. */
  cookies?: Record<string, string>;
  /** Cookie names left out of this request. */
  dropCookies?: string[];
}

let ipCounter = 0;

/** A simulated browser: own cookie jar, own client IP (through X-Forwarded-For from loopback). */
export class Browser {
  readonly jar = new Map<string, string>();
  readonly rawCookies = new Map<string, string>();
  private readonly ip = `10.77.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

  constructor(private readonly booted: BootedApp) {}

  async request(
    method: 'get' | 'post' | 'put',
    path: string,
    json?: unknown,
    opts: RequestOptions = {},
  ): Promise<request.Response> {
    const cookies = opts.cookies ? new Map(Object.entries(opts.cookies)) : new Map(this.jar);
    for (const name of opts.dropCookies ?? []) cookies.delete(name);
    let req = request(this.booted.app.getHttpServer())[method](path).set('X-Forwarded-For', this.ip);
    if (opts.origin !== null) req = req.set('Origin', opts.origin ?? 'http://localhost:5173');
    if (cookies.size) req = req.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    if ((opts.csrf ?? method !== 'get') && this.jar.has('csrftoken'))
      req = req.set('X-CSRFToken', this.jar.get('csrftoken')!);
    for (const [name, value] of Object.entries(opts.headers ?? {})) req = req.set(name, value);
    if (opts.raw !== undefined) {
      if (!Object.keys(opts.headers ?? {}).some((name) => name.toLowerCase() === 'content-type'))
        req = req.set('Content-Type', 'application/json');
      req = req.send(opts.raw);
    } else if (json !== undefined) req = req.send(json as object);
    const res = await req;
    this.absorb((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []);
    return res;
  }

  get(path: string, opts?: RequestOptions) {
    return this.request('get', path, undefined, opts);
  }

  post(path: string, json?: unknown, opts?: RequestOptions) {
    return this.request('post', path, json, opts);
  }

  put(path: string, json?: unknown, opts?: RequestOptions) {
    return this.request('put', path, json, opts);
  }

  async requestCode(email: string): Promise<string> {
    const mark = this.booted.stdout.length;
    const res = await this.post('/api/auth/request-code', { email });
    expect(res.status).toBe(200);
    const line = this.booted.stdout.slice(mark).find((l) => l.startsWith(`LOGIN CODE ${email.toLowerCase()} `));
    expect(line).toBeDefined();
    return line!.trim().split(' ')[3];
  }

  verify(email: string, code: string) {
    return this.post('/api/auth/verify', { email, code });
  }

  async login(email: string): Promise<this> {
    const res = await this.verify(email, await this.requestCode(email));
    expect(res.status).toBe(200);
    return this;
  }

  private absorb(setCookies: string[]): void {
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      this.rawCookies.set(name, raw);
      if (value === '' || (maxAge && Number(maxAge.split('=')[1]) <= 0)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}
