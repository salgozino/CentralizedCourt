import { seedUsers } from '../seed/seed';
import { runCli } from './run';

void runCli(async (dataSource) => {
  const { created, existing } = await seedUsers(dataSource);
  console.log(`Seed done: ${created} created, ${existing} already existed.`);
});
