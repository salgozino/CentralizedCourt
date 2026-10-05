import * as fs from 'node:fs';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';
import { LoginCode, LoginEvent, Session, User } from '../src/entities';
import { migratedDataSource, tempDbPath } from './helpers';

describe('migrations', () => {
  const { dir, dbPath } = tempDbPath();
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await migratedDataSource(dbPath);
  });

  afterAll(async () => {
    await dataSource.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the schema and is a no-op the second time', async () => {
    const tables = await dataSource.query(`SELECT name FROM sqlite_master WHERE type = 'table'`);
    expect(tables.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['users', 'login_codes', 'login_events', 'sessions']),
    );
    expect(await dataSource.runMigrations()).toHaveLength(0);
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('never synchronizes the schema', () => {
    expect(dataSourceOptions(dbPath).synchronize).toBe(false);
  });

  it('applies the User defaults', async () => {
    const user = await dataSource.getRepository(User).save({ email: 'a@example.com' });
    const stored = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
    expect(stored).toMatchObject({ isAdmin: false, isCreator: false, isJuror: false, isActive: true, lastLogin: null });
    expect(stored.dateJoined).toBeInstanceOf(Date);
    expect(Math.abs(stored.dateJoined.getTime() - Date.now())).toBeLessThan(60_000);
    expect(stored.roles).toEqual(['user']);
  });

  it('stores emails lowercase, matches case-insensitively and keeps them unique', async () => {
    const repo = dataSource.getRepository(User);
    await repo.insert({ email: 'MiXed@Example.COM' });
    const raw = await dataSource.query(`SELECT email FROM users WHERE email LIKE 'mixed@%'`);
    expect(raw).toEqual([{ email: 'mixed@example.com' }]);
    expect(await repo.findOneBy({ email: 'MIXED@example.com' })).not.toBeNull();
    await expect(repo.insert({ email: 'mixed@EXAMPLE.com' })).rejects.toThrow(/UNIQUE/);
  });

  it('cascades login codes when the user is deleted', async () => {
    const user = await dataSource.getRepository(User).save({ email: 'cascade@example.com' });
    const codes = dataSource.getRepository(LoginCode);
    const code = await codes.save({ userId: user.id, codeHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 600_000) });
    expect(code).toMatchObject({ usedAt: null, failedAttempts: 0 });
    await dataSource.getRepository(User).delete(user.id);
    expect(await codes.count({ where: { userId: user.id } })).toBe(0);
  });

  it('round-trips login events and sessions', async () => {
    const event = await dataSource.getRepository(LoginEvent).save({ ip: '127.0.0.1', kind: 'request' });
    expect(event.createdAt).toBeInstanceOf(Date);
    const expiresAt = new Date(Date.now() + 1_000_000);
    await dataSource.getRepository(Session).save({ id: 'abc', data: { codeIds: [1, 2], userId: 3 }, expiresAt });
    const session = await dataSource.getRepository(Session).findOneByOrFail({ id: 'abc' });
    expect(session.data).toEqual({ codeIds: [1, 2], userId: 3 });
    expect(session.expiresAt.getTime()).toBe(expiresAt.getTime());
  });
});
