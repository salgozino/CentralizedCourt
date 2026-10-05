import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../entities';

import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User])],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
