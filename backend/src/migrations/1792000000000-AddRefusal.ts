import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefusal1792000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE cases ADD COLUMN refusalWindowSeconds integer`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN selectedById integer REFERENCES users(id) ON DELETE RESTRICT`);
    await q.query(
      `ALTER TABLE case_jurors ADD COLUMN predecessorId integer REFERENCES case_jurors(id) ON DELETE RESTRICT`,
    );
    await q.query(`ALTER TABLE case_jurors ADD COLUMN refusalDeadline datetime`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN refusedAt datetime`);
    await q.query(`CREATE UNIQUE INDEX current_case_seat ON case_jurors(caseId, position) WHERE refusedAt IS NULL`);
    await q.query(
      `CREATE UNIQUE INDEX assignment_successor ON case_jurors(predecessorId) WHERE predecessorId IS NOT NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX assignment_successor`);
    await q.query(`DROP INDEX current_case_seat`);
    for (const column of ['refusedAt', 'refusalDeadline', 'predecessorId', 'selectedById']) {
      await q.query(`ALTER TABLE case_jurors DROP COLUMN "${column}"`);
    }
    await q.query(`ALTER TABLE cases DROP COLUMN refusalWindowSeconds`);
  }
}
