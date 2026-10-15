import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class AddRefusal1792000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE cases ADD COLUMN refusalWindowSeconds integer`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN selectedById integer`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN predecessorId integer`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN refusalDeadline datetime`);
    await q.query(`ALTER TABLE case_jurors ADD COLUMN refusedAt datetime`);
    // SQLite rebuilds the table here, retaining existing data and constraints. Use the same
    // names as entity metadata so migration:generate sees no unrelated schema changes.
    await q.createForeignKeys(
      'case_jurors',
      [
        ['selectedById', 'users'],
        ['predecessorId', 'case_jurors'],
      ].map(
        ([column, target]) =>
          new TableForeignKey({
            name: q.connection.namingStrategy.foreignKeyName('case_jurors', [column], target, ['id']),
            columnNames: [column],
            referencedTableName: target,
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
            onUpdate: 'NO ACTION',
          }),
      ),
    );
    await q.query(`CREATE UNIQUE INDEX current_case_seat ON case_jurors(caseId, position) WHERE refusedAt IS NULL`);
    await q.query(
      `CREATE UNIQUE INDEX assignment_successor ON case_jurors(predecessorId) WHERE predecessorId IS NOT NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX assignment_successor`);
    await q.query(`DROP INDEX current_case_seat`);
    await q.dropColumns('case_jurors', ['refusedAt', 'refusalDeadline', 'predecessorId', 'selectedById']);
    await q.query(`ALTER TABLE cases DROP COLUMN refusalWindowSeconds`);
  }
}
