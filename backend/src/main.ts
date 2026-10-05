import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { APP_OPTIONS, configureApp } from './app';
import { AppModule } from './app.module';
import { AppConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { ...APP_OPTIONS, logger: ['error', 'warn', 'log'] });
  configureApp(app);
  const { port } = app.get(ConfigService).getOrThrow<AppConfig>('app');
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
