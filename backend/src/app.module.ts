import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { AppConfig, loadConfig } from './config/config';
import { dataSourceOptions } from './data-source';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // optional: silently skipped when the file does not exist
      validate: (env) => ({ ...env, app: loadConfig(env) }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => dataSourceOptions(config.getOrThrow<AppConfig>('app').dbPath),
    }),
    AuthModule,
    AdminModule,
    CasesModule,
  ],
})
export class AppModule {}
