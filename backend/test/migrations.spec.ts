import * as fs from 'node:fs';

import { DataSource } from 'typeorm';

import { dataSourceOptions } from '../src/data-source';
import { Case, LoginCode, LoginEvent, Session, User } from '../src/entities';

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
      expect.arrayContaining(['users', 'login_codes', 'login_events', 'sessions', 'cases', 'case_jurors']),
    );
    expect(await dataSource.runMigrations()).toHaveLength(0);
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('never synchronizes the schema', () => {
    expect(dataSourceOptions(dbPath).synchronize).toBe(false);
  });

  it('adds nullable vote columns to case_jurors and reverts them cleanly', async () => {
    const columns = await dataSource.query('PRAGMA table_info(case_jurors)');
    expect(columns).toContainEqual(expect.objectContaining({ name: 'outcomeIndex', notnull: 0, dflt_value: null }));
    expect(columns).toContainEqual(expect.objectContaining({ name: 'votedAt', notnull: 0, dflt_value: null }));
    await dataSource.undoLastMigration();
    const reverted = (await dataSource.query('PRAGMA table_info(case_jurors)')).map((c: { name: string }) => c.name);
    expect(reverted).toEqual(['id', 'caseId', 'userId', 'position', 'drawnAt', 'deadline']);
    await dataSource.runMigrations();
  });

  it('adds a required name column without a default and round-trips a user name', async () => {
    const columns = await dataSource.query('PRAGMA table_info(users)');
    expect(columns).toContainEqual(expect.objectContaining({ name: 'name', notnull: 1, dflt_value: null }));
    // Revert and reapply on the empty DB (vote columns first): resetting development data is explicitly permitted.
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    expect(await dataSource.query('PRAGMA table_info(users)')).not.toContainEqual(
      expect.objectContaining({ name: 'name' }),
    );
    await dataSource.runMigrations();
    await dataSource.getRepository(User).insert({ email: 'named@example.com', name: 'Alice' });
    expect(await dataSource.getRepository(User).findOneByOrFail({ email: 'named@example.com' })).toMatchObject({
      name: 'Alice',
    });
  });

  it('rejects users without a name, null inserts and null updates at the DB level', async () => {
    await expect(dataSource.query('INSERT INTO users (email) VALUES (?)', ['missing@example.com'])).rejects.toThrow(
      /NOT NULL/,
    );
    await expect(
      dataSource.query('INSERT INTO users (email, name) VALUES (?, ?)', ['null@example.com', null]),
    ).rejects.toThrow(/NOT NULL/);
    await expect(
      dataSource.query('UPDATE users SET name = NULL WHERE email = ?', ['named@example.com']),
    ).rejects.toThrow(/NOT NULL/);
  });

  it('applies the User defaults', async () => {
    const user = await dataSource.getRepository(User).save({ email: 'a@example.com', name: 'Alice' });
    const stored = await dataSource.getRepository(User).findOneByOrFail({ id: user.id });
    expect(stored).toMatchObject({ isAdmin: false, isCreator: false, isJuror: false, isActive: true, lastLogin: null });
    expect(stored.dateJoined).toBeInstanceOf(Date);
    expect(Math.abs(stored.dateJoined.getTime() - Date.now())).toBeLessThan(60_000);
    expect(stored.roles).toEqual(['user']);
  });

  it('stores emails lowercase, matches case-insensitively and keeps them unique', async () => {
    const repo = dataSource.getRepository(User);
    await repo.insert({ email: 'MiXed@Example.COM', name: 'Mixed' });
    const raw = await dataSource.query(`SELECT email FROM users WHERE email LIKE 'mixed@%'`);
    expect(raw).toEqual([{ email: 'mixed@example.com' }]);
    expect(await repo.findOneBy({ email: 'MIXED@example.com' })).not.toBeNull();
    await expect(repo.insert({ email: 'mixed@EXAMPLE.com', name: 'Duplicate' })).rejects.toThrow(/UNIQUE/);
  });

  it('cascades login codes when the user is deleted', async () => {
    const user = await dataSource.getRepository(User).save({ email: 'cascade@example.com', name: 'Cascade' });
    const codes = dataSource.getRepository(LoginCode);
    const code = await codes.save({
      userId: user.id,
      codeHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 600_000),
    });
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

  it('applies the Case defaults and round-trips outcomes', async () => {
    const creator = await dataSource.getRepository(User).save({ email: 'case-owner@example.com', name: 'Case Owner' });
    const repo = dataSource.getRepository(Case);
    const saved = await repo.save(
      repo.create({
        creatorId: creator.id,
        title: 'T',
        description: 'D',
        outcomes: ['A', 'B'],
        voteWindowSeconds: 120,
      }),
    );
    const stored = await repo.findOneByOrFail({ id: saved.id });
    expect(stored).toMatchObject({
      outcomes: ['A', 'B'],
      panelSize: 3,
      selectionMethod: 'random',
      status: 'awaiting_jurors',
      result: null,
    });
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('refuses to delete a user who created a case', async () => {
    const creator = await dataSource.getRepository(User).findOneByOrFail({ email: 'case-owner@example.com' });
    await expect(dataSource.getRepository(User).delete(creator.id)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('reverts the case_jurors and cases migrations cleanly', async () => {
    const { dir: revertDir, dbPath: revertPath } = tempDbPath();
    const ds = await migratedDataSource(revertPath);
    const tableNames = async () =>
      (await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t: { name: string }) => t.name);
    // First revert the vote columns, then the user-name migration.
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    expect(await ds.query('PRAGMA table_info(users)')).not.toContainEqual(expect.objectContaining({ name: 'name' }));
    await ds.undoLastMigration();
    expect(await tableNames()).not.toContain('case_jurors');
    expect(await tableNames()).toContain('cases');
    await ds.undoLastMigration();
    expect(await tableNames()).not.toContain('cases');
    await ds.destroy();
    fs.rmSync(revertDir, { recursive: true, force: true });
  });
});
