import { runCli } from './run';

void runCli(async (dataSource) => {
  const applied = await dataSource.runMigrations();
  console.log(`Migrations done: ${applied.length} applied.`);
});
