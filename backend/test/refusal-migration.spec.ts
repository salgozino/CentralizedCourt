import * as fs from 'node:fs';

import { DataSource } from 'typeorm';

import { dataSourceOptions } from '../src/data-source';
import { MIGRATIONS } from '../src/migrations';
import { seedUsers } from '../src/seed/seed';

import { tempDbPath } from './helpers';

it('upgrades populated legacy cases without opting them into refusal or changing stored deadlines and votes', async () => {
  const { dir, dbPath } = tempDbPath();
  const ds = new DataSource({ ...dataSourceOptions(dbPath), migrations: MIGRATIONS.slice(0, -1) });
  await ds.initialize();
  try {
    await ds.runMigrations();
    await seedUsers(ds);
    const [{ id: creatorId }] = await ds.query(`SELECT id FROM users WHERE email = 'creator1@example.com'`);
    const [{ id: jurorId }] = await ds.query(`SELECT id FROM users WHERE email = 'juror1@example.com'`);
    for (const status of ['awaiting_jurors', 'voting', 'resolved']) {
      await ds.query(
        `INSERT INTO cases (creatorId,title,description,outcomes,voteWindowSeconds,panelSize,selectionMethod,status,result)
        VALUES (?, ?, 'Details', '["A","B"]', 120, 1, 'manual', ?, ?)`,
        [creatorId, status, status, status === 'resolved' ? 'A' : null],
      );
    }
    await ds.query(
      `INSERT INTO case_jurors (caseId,userId,position,drawnAt,deadline,outcomeIndex,votedAt)
      SELECT id, ?, 0, '2030-01-01 00:00:00', '2030-01-01 00:02:00', 0, '2030-01-01 00:01:00'
      FROM cases WHERE status != 'awaiting_jurors'`,
      [jurorId],
    );
    const casesBefore = await ds.query('SELECT * FROM cases ORDER BY id');
    const seatsBefore = await ds.query('SELECT * FROM case_jurors ORDER BY id');
    // Reopen with the complete migration list, as a normal upgrade does.
    await ds.destroy();
    const upgraded = new DataSource(dataSourceOptions(dbPath));
    await upgraded.initialize();
    try {
      expect(await upgraded.runMigrations()).toHaveLength(1);
      expect(await upgraded.query('SELECT * FROM cases ORDER BY id')).toEqual(
        casesBefore.map((c: object) => ({ ...c, refusalWindowSeconds: null })),
      );
      expect(await upgraded.query('SELECT * FROM case_jurors ORDER BY id')).toEqual(
        seatsBefore.map((j: object) => ({
          ...j,
          selectedById: null,
          predecessorId: null,
          refusalDeadline: null,
          refusedAt: null,
        })),
      );
    } finally {
      await upgraded.destroy();
    }
  } finally {
    if (ds.isInitialized) await ds.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
