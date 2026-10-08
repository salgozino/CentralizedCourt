import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Case } from '../entities';

import { CasesController } from './cases.controller';
import { CreatorGuard } from './creator.guard';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Case])],
  controllers: [CasesController],
  providers: [CreatorGuard],
})
export class CasesModule {}
