import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCaseJurors1791480908801 implements MigrationInterface {
  name = 'CreateCaseJurors1791480908801';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "case_jurors" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "caseId" integer NOT NULL, "userId" integer NOT NULL, "position" smallint NOT NULL, "drawnAt" datetime NOT NULL, "deadline" datetime NOT NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2ebefde32f44a05779ac6cc85b" ON "case_jurors" ("userId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8fdc4225faee16a947a22469e6" ON "case_jurors" ("caseId", "userId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_2ebefde32f44a05779ac6cc85b"`);
    await queryRunner.query(`DROP INDEX "IDX_8fdc4225faee16a947a22469e6"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_case_jurors" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "caseId" integer NOT NULL, "userId" integer NOT NULL, "position" smallint NOT NULL, "drawnAt" datetime NOT NULL, "deadline" datetime NOT NULL, CONSTRAINT "FK_cb9d7d0d1ea8cba35258159dc6d" FOREIGN KEY ("caseId") REFERENCES "cases" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_2ebefde32f44a05779ac6cc85b3" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_case_jurors"("id", "caseId", "userId", "position", "drawnAt", "deadline") SELECT "id", "caseId", "userId", "position", "drawnAt", "deadline" FROM "case_jurors"`,
    );
    await queryRunner.query(`DROP TABLE "case_jurors"`);
    await queryRunner.query(`ALTER TABLE "temporary_case_jurors" RENAME TO "case_jurors"`);
    await queryRunner.query(`CREATE INDEX "IDX_2ebefde32f44a05779ac6cc85b" ON "case_jurors" ("userId") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8fdc4225faee16a947a22469e6" ON "case_jurors" ("caseId", "userId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_8fdc4225faee16a947a22469e6"`);
    await queryRunner.query(`DROP INDEX "IDX_2ebefde32f44a05779ac6cc85b"`);
    await queryRunner.query(`ALTER TABLE "case_jurors" RENAME TO "temporary_case_jurors"`);
    await queryRunner.query(
      `CREATE TABLE "case_jurors" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "caseId" integer NOT NULL, "userId" integer NOT NULL, "position" smallint NOT NULL, "drawnAt" datetime NOT NULL, "deadline" datetime NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "case_jurors"("id", "caseId", "userId", "position", "drawnAt", "deadline") SELECT "id", "caseId", "userId", "position", "drawnAt", "deadline" FROM "temporary_case_jurors"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_case_jurors"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8fdc4225faee16a947a22469e6" ON "case_jurors" ("caseId", "userId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2ebefde32f44a05779ac6cc85b" ON "case_jurors" ("userId") `);
    await queryRunner.query(`DROP INDEX "IDX_8fdc4225faee16a947a22469e6"`);
    await queryRunner.query(`DROP INDEX "IDX_2ebefde32f44a05779ac6cc85b"`);
    await queryRunner.query(`DROP TABLE "case_jurors"`);
  }
}
