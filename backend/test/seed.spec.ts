import * as fs from 'node:fs';

import { DataSource } from 'typeorm';

import { User } from '../src/entities';
import { seedUsers } from '../src/seed/seed';

import { migratedDataSource, tempDbPath } from './helpers';

const EXPECTED_ROLES: Record<string, string[]> = {
  'admin@example.com': ['admin', 'user'],
  'creator1@example.com': ['creator', 'user'],
  'creator2@example.com': ['creator', 'user'],
  'juror1@example.com': ['juror', 'user'],
  'juror2@example.com': ['juror', 'user'],
  'juror3@example.com': ['juror', 'user'],
  'juror4@example.com': ['juror', 'user'],
  'juror5@example.com': ['juror', 'user'],
  'user@example.com': ['user'],
};

describe('seedUsers', () => {
  const { dir, dbPath } = tempDbPath();
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await migratedDataSource(dbPath);
  });

  afterAll(async () => {
    await dataSource.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the 9 users with the right roles', async () => {
    expect(await seedUsers(dataSource)).toEqual({ created: 9, existing: 0 });
    const users = await dataSource.getRepository(User).find();
    expect(Object.fromEntries(users.map((u) => [u.email, u.roles]))).toEqual(EXPECTED_ROLES);
  });

  it('is idempotent and does not reset changed roles', async () => {
    const repo = dataSource.getRepository(User);
    await repo.update({ email: 'user@example.com' }, { isCreator: true, isJuror: true });
    await repo.update({ email: 'juror1@example.com' }, { isJuror: false });

    expect(await seedUsers(dataSource)).toEqual({ created: 0, existing: 9 });
    expect(await repo.count()).toBe(9);
    expect((await repo.findOneByOrFail({ email: 'user@example.com' })).roles).toEqual(['creator', 'juror', 'user']);
    expect((await repo.findOneByOrFail({ email: 'juror1@example.com' })).roles).toEqual(['user']);
  });
});
