import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Case, CaseJuror } from '../entities';

import { CasesController } from './cases.controller';
import { CLOCK, systemClock } from './clock';
import { CreatorGuard } from './creator.guard';
import { DRAW_RNG, JuryService, cryptoRng } from './jury.service';
import { VotingService } from './voting.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Case, CaseJuror])],
  controllers: [CasesController],
  // The admin roles endpoint asks whether a juror is on an active case.
  exports: [VotingService],
  providers: [
    CreatorGuard,
    JuryService,
    VotingService,
    { provide: DRAW_RNG, useValue: cryptoRng },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class CasesModule {}
