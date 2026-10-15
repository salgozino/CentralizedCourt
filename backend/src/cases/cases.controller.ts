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
import { UnprocessableException } from '../http/errors';
import { ZodBodyPipe } from '../http/validation';

import { CreatorGuard } from './creator.guard';
import {
  CaseDetailOut,
  CaseOut,
  CreateCaseIn,
  DrawIn,
  DrawOut,
  EligibleJurorOut,
  VoteIn,
  toCaseOut,
  toJurorOut,
} from './dto';
import { JuryService } from './jury.service';
import { VotingService } from './voting.service';

/** Guard order matters: authenticate (401), CSRF (403), creator (403); pipes only run after all guards pass. */
@Controller('cases')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class CasesController {
  constructor(
    @InjectRepository(Case) private readonly cases: Repository<Case>,
    @InjectRepository(CaseJuror) private readonly jurors: Repository<CaseJuror>,
    private readonly jury: JuryService,
    private readonly voting: VotingService,
  ) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest): Promise<CaseOut[]> {
    const query = () => this.visibleCases(req.user).orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC').getMany();
    let rows = await query();
    const due = rows.filter((c) => c.status === 'voting').map((c) => c.id);
    if (due.length) {
      await this.voting.settle(due);
      rows = await query();
    }
    // Lists intentionally omit the panel, even for admins and assigned jurors.
    return rows.map(toCaseOut);
  }

  @Get(':id')
  async detail(@Req() req: AuthenticatedRequest, @Param('id') rawId: string): Promise<CaseDetailOut> {
    const row = await this.visibleCase(req.user, rawId);
    if (row.status === 'voting') await this.voting.settle([row.id]);
    return this.detailFor(req.user, row.id);
  }

  /**
   * Unreadable cases are 404 (as for reads); readers who are not on the panel, such as the owner or an admin, are
   * 403; then the body (422); then the voting rules (409).
   */
  @Post(':id/vote')
  @HttpCode(200)
  async vote(
    @Req() req: AuthenticatedRequest,
    @Param('id') rawId: string,
    @Body() body: unknown,
  ): Promise<CaseDetailOut> {
    const row = await this.visibleCase(req.user, rawId);
    if (!(await this.jurors.existsBy({ caseId: row.id, userId: req.user.id }))) {
      throw new ForbiddenException('Only drawn jurors can vote');
    }
    const { outcomeIndex } = new ZodBodyPipe(VoteIn).transform(body ?? {});
    if (outcomeIndex >= row.outcomes.length) {
      throw new UnprocessableException('outcomeIndex must refer to one of the case outcomes');
    }
    await this.voting.cast(row.id, req.user.id, outcomeIndex);
    return this.detailFor(req.user, row.id);
  }

  private async visibleCase(user: User, rawId: string): Promise<Case> {
    const row = await this.visibleCases(user)
      .andWhere('c.id = :id', { id: parseId(rawId) })
      .getOne();
    if (!row) throw new NotFoundException();
    return row;
  }

  /** Votes are public once resolved; while voting each juror only sees their own choice. */
  private async detailFor(viewer: User, caseId: number): Promise<CaseDetailOut> {
    const row = await this.cases.findOneByOrFail({ id: caseId });
    const panel = await this.jurors.find({
      where: { caseId },
      relations: { user: true },
      order: { position: 'ASC' },
    });
    const resolved = row.status === 'resolved';
    return { ...toCaseOut(row), jurors: panel.map((j) => toJurorOut(j, resolved || j.userId === viewer.id)) };
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

  /** The pool a manual panel is picked from. Same permission as the draw itself; reads need no CSRF. */
  @Get(':id/eligible-jurors')
  async eligibleJurors(@Req() req: AuthenticatedRequest, @Param('id') rawId: string): Promise<EligibleJurorOut[]> {
    await this.drawableCase(req.user, rawId);
    return (await this.jury.eligible()).map((u) => ({ jurorId: u.id, name: u.name }));
  }

  /**
   * Missing cases are 404 for everyone; an existing case owned by someone else is 403, as the draw spec requires.
   * Checked before the body (403 before 422).
   */
  private async drawableCase(user: User, rawId: string): Promise<Case> {
    const row = await this.cases.findOneBy({ id: parseId(rawId) });
    if (!row) throw new NotFoundException();
    if (row.creatorId !== user.id && !user.isAdmin) {
      throw new ForbiddenException('Only the case creator or an admin can draw jurors');
    }
    return row;
  }

  @Post(':id/draw')
  @HttpCode(200)
  async draw(@Req() req: AuthenticatedRequest, @Param('id') rawId: string, @Body() body: unknown): Promise<DrawOut> {
    const row = await this.drawableCase(req.user, rawId);
    // A bodiless POST leaves req.body undefined; for a random draw that is the normal call.
    const { jurorIds } = new ZodBodyPipe(DrawIn).transform(body ?? {});
    const seated = await this.jury.seat(row.id, jurorIds);
    // Nobody has voted yet on a freshly seated panel.
    const jurors = seated.jurors.map((j) => toJurorOut(j, false));
    return { case: { ...toCaseOut(seated.case), jurors }, jurors };
  }
}

function parseId(rawId: string): number {
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id < 1) throw new NotFoundException();
  return id;
}
