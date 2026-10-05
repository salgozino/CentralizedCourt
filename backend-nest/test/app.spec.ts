import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { configureApp } from '../src/app';
import { tempDbPath } from './helpers';

describe('app bootstrap', () => {
  const { dir, dbPath } = tempDbPath();
  const saved = { ...process.env };
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SECRET_KEY = 'test-secret';
    process.env.DB_PATH = dbPath;
    // ConfigModule.forRoot validates while app.module is imported, so env must be set first.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves under the /api prefix (unknown routes are 404 JSON)', async () => {
    const res = await request(app.getHttpServer()).get('/api/me');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('exits with a clear message when SECRET_KEY is missing', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, DB_PATH: dbPath };
    delete env.SECRET_KEY;
    const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], {
      cwd: path.resolve(__dirname, '..'),
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SECRET_KEY environment variable is required/);
  });
});
