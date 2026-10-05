import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { resolveDbPath } from '../config/config';
import { dataSourceOptions } from '../data-source';

/** Loads .env (if present), opens the DB at DB_PATH, runs the task, always closes it. */
export async function runCli(task: (dataSource: DataSource) => Promise<void>): Promise<void> {
  dotenv.config({ quiet: true });
  const dataSource = new DataSource(dataSourceOptions(resolveDbPath(process.env)));
  try {
    await dataSource.initialize();
    await task(dataSource);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
