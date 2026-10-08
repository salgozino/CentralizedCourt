import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CsrfGuard } from '../auth/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { Case } from '../entities';
import { ZodBodyPipe } from '../http/validation';

import { CreatorGuard } from './creator.guard';
import { CaseOut, CreateCaseIn, toCaseOut } from './dto';

/** Guard order matters: authenticate (401), CSRF (403), creator (403); pipes only run after all guards pass. */
@Controller('cases')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class CasesController {
  constructor(@InjectRepository(Case) private readonly cases: Repository<Case>) {}

  @Post()
  @HttpCode(201)
  @UseGuards(CreatorGuard)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodBodyPipe(CreateCaseIn)) payload: CreateCaseIn,
  ): Promise<CaseOut> {
    const created = await this.cases.save(this.cases.create({ ...payload, creatorId: req.user.id }));
    // Re-read so DB defaults (status, timestamps) come back exactly as stored.
    return toCaseOut(await this.cases.findOneByOrFail({ id: created.id }));
  }
}
