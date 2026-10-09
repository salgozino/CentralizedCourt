import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserName1791572083979 implements MigrationInterface {
  name = 'AddUserName1791572083979';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add in place instead of rebuilding users: existing case/login foreign keys remain intact.
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "name" varchar(200)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "name"');
  }
}
