import { INestApplication } from '@nestjs/common';

export const GLOBAL_PREFIX = 'api';

/** Shared by main.ts and the tests so both see the same HTTP surface. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
}
