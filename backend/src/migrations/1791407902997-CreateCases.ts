import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCases1791407902997 implements MigrationInterface {
  name = 'CreateCases1791407902997';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cases" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "creatorId" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL, "outcomes" text NOT NULL, "voteWindowSeconds" integer NOT NULL, "panelSize" smallint NOT NULL DEFAULT (3), "selectionMethod" varchar(10) NOT NULL DEFAULT ('random'), "status" varchar(20) NOT NULL DEFAULT ('awaiting_jurors'), "result" varchar(100), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b1d9c9594136eff62b21db47bb" ON "cases" ("creatorId") `);
    await queryRunner.query(`DROP INDEX "IDX_b1d9c9594136eff62b21db47bb"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_cases" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "creatorId" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL, "outcomes" text NOT NULL, "voteWindowSeconds" integer NOT NULL, "panelSize" smallint NOT NULL DEFAULT (3), "selectionMethod" varchar(10) NOT NULL DEFAULT ('random'), "status" varchar(20) NOT NULL DEFAULT ('awaiting_jurors'), "result" varchar(100), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_b1d9c9594136eff62b21db47bb6" FOREIGN KEY ("creatorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_cases"("id", "creatorId", "title", "description", "outcomes", "voteWindowSeconds", "panelSize", "selectionMethod", "status", "result", "createdAt", "updatedAt") SELECT "id", "creatorId", "title", "description", "outcomes", "voteWindowSeconds", "panelSize", "selectionMethod", "status", "result", "createdAt", "updatedAt" FROM "cases"`,
    );
    await queryRunner.query(`DROP TABLE "cases"`);
    await queryRunner.query(`ALTER TABLE "temporary_cases" RENAME TO "cases"`);
    await queryRunner.query(`CREATE INDEX "IDX_b1d9c9594136eff62b21db47bb" ON "cases" ("creatorId") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_b1d9c9594136eff62b21db47bb"`);
    await queryRunner.query(`ALTER TABLE "cases" RENAME TO "temporary_cases"`);
    await queryRunner.query(
      `CREATE TABLE "cases" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "creatorId" integer NOT NULL, "title" varchar(200) NOT NULL, "description" text NOT NULL, "outcomes" text NOT NULL, "voteWindowSeconds" integer NOT NULL, "panelSize" smallint NOT NULL DEFAULT (3), "selectionMethod" varchar(10) NOT NULL DEFAULT ('random'), "status" varchar(20) NOT NULL DEFAULT ('awaiting_jurors'), "result" varchar(100), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "cases"("id", "creatorId", "title", "description", "outcomes", "voteWindowSeconds", "panelSize", "selectionMethod", "status", "result", "createdAt", "updatedAt") SELECT "id", "creatorId", "title", "description", "outcomes", "voteWindowSeconds", "panelSize", "selectionMethod", "status", "result", "createdAt", "updatedAt" FROM "temporary_cases"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_cases"`);
    await queryRunner.query(`CREATE INDEX "IDX_b1d9c9594136eff62b21db47bb" ON "cases" ("creatorId") `);
    await queryRunner.query(`DROP INDEX "IDX_b1d9c9594136eff62b21db47bb"`);
    await queryRunner.query(`DROP TABLE "cases"`);
  }
}
