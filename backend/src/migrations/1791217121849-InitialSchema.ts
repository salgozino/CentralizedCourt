import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791217121849 implements MigrationInterface {
  name = 'InitialSchema1791217121849';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar(254) NOT NULL, "isAdmin" boolean NOT NULL DEFAULT (0), "isCreator" boolean NOT NULL DEFAULT (0), "isJuror" boolean NOT NULL DEFAULT (0), "isActive" boolean NOT NULL DEFAULT (1), "dateJoined" datetime NOT NULL DEFAULT (datetime('now')), "lastLogin" datetime, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "login_codes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "codeHash" varchar(64) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime NOT NULL, "usedAt" datetime, "failedAttempts" smallint NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `CREATE TABLE "login_events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ip" varchar(45) NOT NULL, "kind" varchar(10) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9df185d306eceab0faa091f781" ON "login_events" ("ip", "kind", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" varchar(64) PRIMARY KEY NOT NULL, "data" text NOT NULL, "expiresAt" datetime NOT NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_50762206f116cd47d1c3fec396" ON "sessions" ("expiresAt") `);
    await queryRunner.query(
      `CREATE TABLE "temporary_login_codes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "codeHash" varchar(64) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime NOT NULL, "usedAt" datetime, "failedAttempts" smallint NOT NULL DEFAULT (0), CONSTRAINT "FK_5bcc529db4c8585a339b20248fb" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_login_codes"("id", "userId", "codeHash", "createdAt", "expiresAt", "usedAt", "failedAttempts") SELECT "id", "userId", "codeHash", "createdAt", "expiresAt", "usedAt", "failedAttempts" FROM "login_codes"`,
    );
    await queryRunner.query(`DROP TABLE "login_codes"`);
    await queryRunner.query(`ALTER TABLE "temporary_login_codes" RENAME TO "login_codes"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "login_codes" RENAME TO "temporary_login_codes"`);
    await queryRunner.query(
      `CREATE TABLE "login_codes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "codeHash" varchar(64) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime NOT NULL, "usedAt" datetime, "failedAttempts" smallint NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "login_codes"("id", "userId", "codeHash", "createdAt", "expiresAt", "usedAt", "failedAttempts") SELECT "id", "userId", "codeHash", "createdAt", "expiresAt", "usedAt", "failedAttempts" FROM "temporary_login_codes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_login_codes"`);
    await queryRunner.query(`DROP INDEX "IDX_50762206f116cd47d1c3fec396"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "IDX_9df185d306eceab0faa091f781"`);
    await queryRunner.query(`DROP TABLE "login_events"`);
    await queryRunner.query(`DROP TABLE "login_codes"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
