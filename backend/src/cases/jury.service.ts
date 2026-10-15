import { randomInt } from 'node:crypto';

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Case, CaseJuror, User } from '../entities';
import { UnprocessableException } from '../http/errors';

import { CLOCK, Clock } from './clock';

/** Returns an integer in [0, maxExclusive). Overridden in tests with a seeded generator. */
export type DrawRng = (maxExclusive: number) => number;
export const DRAW_RNG = 'DRAW_RNG';
export const cryptoRng: DrawRng = (maxExclusive) => randomInt(maxExclusive);

export const NOT_AWAITING = 'Jurors can only be drawn while the case is awaiting jurors';
export const NOT_A_JUROR = 'Only users with the juror role can be assigned';

/** Admins are never eligible, even with the juror flag: they already control the case. */
const isEligible = (u: User) => u.isJuror && !u.isAdmin && u.isActive;

@Injectable()
export class JuryService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(DRAW_RNG) private readonly rng: DrawRng,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Seats the panel and moves the case to voting; `jurorIds` is only given for manual cases. */
  async seat(caseId: number, jurorIds?: number[]): Promise<{ case: Case; jurors: CaseJuror[] }> {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.findOneByOrFail(Case, { id: caseId });
      if (row.status !== 'awaiting_jurors') throw new ConflictException(NOT_AWAITING);
      const panel = await this.select(manager, row, jurorIds);

      // Conditional update so two concurrent draws cannot both seat a panel.
      const moved = await manager.update(Case, { id: caseId, status: 'awaiting_jurors' }, { status: 'voting' });
      if (!moved.affected) throw new ConflictException(NOT_AWAITING);

      const drawnAt = this.clock();
      const deadline = new Date(drawnAt.getTime() + row.voteWindowSeconds * 1000);
      const jurors = await manager.save(
        panel.map((user, position) =>
          manager.create(CaseJuror, {
            caseId,
            userId: user.id,
            user,
            position,
            drawnAt,
            deadline,
            outcomeIndex: null,
            votedAt: null,
          }),
        ),
      );
      return { case: await manager.findOneByOrFail(Case, { id: caseId }), jurors };
    });
  }

  private async select(manager: EntityManager, row: Case, jurorIds?: number[]): Promise<User[]> {
    if (row.selectionMethod === 'random') {
      if (jurorIds !== undefined) throw new UnprocessableException('jurorIds are only accepted for manual selection');
      return this.drawn(manager, row.panelSize);
    }
    if (jurorIds === undefined) {
      throw new UnprocessableException([
        { type: 'missing', loc: ['body', 'payload', 'jurorIds'], msg: 'Field required' },
      ]);
    }
    if (jurorIds.length !== row.panelSize) {
      throw new UnprocessableException(`Exactly ${row.panelSize} jurorIds are required`);
    }
    return this.assigned(manager, jurorIds);
  }

  private async assigned(manager: EntityManager, jurorIds: number[]): Promise<User[]> {
    const users = await manager.findBy(
      User,
      jurorIds.map((id) => ({ id })),
    );
    const byId = new Map(users.map((u) => [u.id, u]));
    const panel = jurorIds.map((id) => byId.get(id));
    if (!panel.every((u): u is User => u !== undefined && isEligible(u))) throw new UnprocessableException(NOT_A_JUROR);
    return panel;
  }

  /** Partial Fisher-Yates over the pool ordered by id, so a seeded RNG gives the same panel. */
  private async drawn(manager: EntityManager, panelSize: number): Promise<User[]> {
    const pool = await manager.find(User, {
      where: { isJuror: true, isAdmin: false, isActive: true },
      order: { id: 'ASC' },
    });
    if (pool.length < panelSize) {
      throw new ConflictException(`Not enough eligible jurors: ${pool.length} available, ${panelSize} required`);
    }
    for (let i = 0; i < panelSize; i++) {
      const j = i + this.rng(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, panelSize);
  }
}
