import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';

export function tempDbPath(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-nest-test-'));
  return { dir, dbPath: path.join(dir, 'db.sqlite3') };
}

export async function migratedDataSource(dbPath: string): Promise<DataSource> {
  const dataSource = new DataSource(dataSourceOptions(dbPath));
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}
