import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

import { resolveDbPath } from './config/config';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

/** Schema is only ever changed by migrations, never by synchronize. */
export function dataSourceOptions(dbPath: string): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: dbPath,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  };
}

// Default export for the TypeORM CLI (`yarn migration:generate`).
export default new DataSource(dataSourceOptions(resolveDbPath(process.env)));
