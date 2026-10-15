import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJurorVotes1791900000000 implements MigrationInterface {
  name = 'AddJurorVotes1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "case_jurors" ADD COLUMN "outcomeIndex" smallint`);
    await queryRunner.query(`ALTER TABLE "case_jurors" ADD COLUMN "votedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "case_jurors" DROP COLUMN "votedAt"`);
    await queryRunner.query(`ALTER TABLE "case_jurors" DROP COLUMN "outcomeIndex"`);
  }
}
