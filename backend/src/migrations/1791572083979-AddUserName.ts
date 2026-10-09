import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserName1791572083979 implements MigrationInterface {
  name = 'AddUserName1791572083979';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fresh development DB only: users must be empty when adding a required column without a default.
    // Previously migrated development databases must be reset and reseeded.
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "name" varchar(200) NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "name"');
  }
}
