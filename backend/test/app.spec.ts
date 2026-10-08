import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { APP_OPTIONS, configureApp } from '../src/app';

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
    app = moduleRef.createNestApplication(APP_OPTIONS);
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves under the /api prefix (unknown routes are 404 JSON)', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ detail: 'Not Found' });
  });

  it('exits with a clear message when SECRET_KEY is missing', () => {
    const backendDir = path.resolve(__dirname, '..');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DB_PATH: dbPath,
      TS_NODE_PROJECT: path.join(backendDir, 'tsconfig.json'),
    };
    delete env.SECRET_KEY;
    // Run from the temp dir so a developer's backend/.env (loaded from cwd) cannot supply SECRET_KEY.
    const result = spawnSync(
      process.execPath,
      ['-r', require.resolve('ts-node/register/transpile-only'), path.join(backendDir, 'src/main.ts')],
      { cwd: dir, env, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SECRET_KEY environment variable is required/);
  });
});
