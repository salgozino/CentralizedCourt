import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CsrfGuard } from '../auth/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { Case, CaseJuror, User } from '../entities';
import { ZodBodyPipe } from '../http/validation';

import { CreatorGuard } from './creator.guard';
import { CaseDetailOut, CaseOut, CreateCaseIn, DrawIn, DrawOut, toCaseOut, toJurorOut } from './dto';
import { JuryService } from './jury.service';

/** Guard order matters: authenticate (401), CSRF (403), creator (403); pipes only run after all guards pass. */
@Controller('cases')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class CasesController {
  constructor(
    @InjectRepository(Case) private readonly cases: Repository<Case>,
    @InjectRepository(CaseJuror) private readonly jurors: Repository<CaseJuror>,
    private readonly jury: JuryService,
  ) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest): Promise<CaseOut[]> {
    const rows = await this.visibleCases(req.user).orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC').getMany();
    // Lists intentionally omit the panel, even for admins and assigned jurors.
    return rows.map(toCaseOut);
  }

  @Get(':id')
  async detail(@Req() req: AuthenticatedRequest, @Param('id') rawId: string): Promise<CaseDetailOut> {
    const row = await this.visibleCases(req.user)
      .andWhere('c.id = :id', { id: parseId(rawId) })
      .getOne();
    if (!row) throw new NotFoundException();
    const panel = await this.jurors.find({
      where: { caseId: row.id },
      relations: { user: true },
      order: { position: 'ASC' },
    });
    return { ...toCaseOut(row), jurors: panel.map(toJurorOut) };
  }

  /** Assignment, not the current role flag, grants access. EXISTS avoids duplicate owned/assigned rows. */
  private visibleCases(user: User) {
    const query = this.cases.createQueryBuilder('c');
    if (!user.isAdmin) {
      const assigned = query
        .subQuery()
        .select('1')
        .from(CaseJuror, 'j')
        .where('j.caseId = c.id AND j.userId = :userId')
        .getQuery();
      query.where(`(c.creatorId = :userId OR EXISTS ${assigned})`, { userId: user.id });
    }
    return query;
  }

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

  /**
   * Ownership is checked before the body (403 before 422). Missing cases are 404 for everyone; an existing case
   * owned by someone else is 403, as the draw spec requires.
   */
  @Post(':id/draw')
  @HttpCode(200)
  async draw(@Req() req: AuthenticatedRequest, @Param('id') rawId: string, @Body() body: unknown): Promise<DrawOut> {
    const row = await this.cases.findOneBy({ id: parseId(rawId) });
    if (!row) throw new NotFoundException();
    if (row.creatorId !== req.user.id && !req.user.isAdmin) {
      throw new ForbiddenException('Only the case creator or an admin can draw jurors');
    }
    // A bodiless POST leaves req.body undefined; for a random draw that is the normal call.
    const { jurorIds } = new ZodBodyPipe(DrawIn).transform(body ?? {});
    const seated = await this.jury.seat(row.id, jurorIds);
    const jurors = seated.jurors.map(toJurorOut);
    return { case: { ...toCaseOut(seated.case), jurors }, jurors };
  }
}

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id < 1) throw new NotFoundException();
  return id;
}
