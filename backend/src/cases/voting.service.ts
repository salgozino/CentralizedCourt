import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { Case, CaseJuror } from '../entities';

import { CLOCK, Clock } from './clock';

export const DEADLINE_PASSED = 'The voting deadline has passed';
export const NOT_VOTING = 'Votes are only accepted while the case is voting';
export const ALREADY_VOTED = 'You have already voted';

/** What the voting rules read from a seat; plain values, so the rules are pure functions of `now`. */
export type Seat = Pick<CaseJuror, 'outcomeIndex' | 'deadline'>;

/** A juror's window closes at their deadline: a vote at exactly that instant is late. */
export const isPastDeadline = (seat: Seat, now: Date): boolean => now.getTime() >= seat.deadline.getTime();

/** A seated panel is due when every juror voted or every juror's deadline passed. */
export function isDue(panel: Seat[], now: Date): boolean {
  if (!panel.length) return false;
  return panel.every((j) => j.outcomeIndex !== null) || panel.every((j) => isPastDeadline(j, now));
}

/** Strictly more than half of the cast votes wins; a split, a tie or no votes at all resolve without a result. */
export function majority(outcomes: string[], panel: Seat[]): string | null {
  const cast = panel.filter((j) => j.outcomeIndex !== null).map((j) => j.outcomeIndex!);
  const counts = new Map<number, number>();
  for (const index of cast) counts.set(index, (counts.get(index) ?? 0) + 1);
  for (const [index, count] of counts) if (count * 2 > cast.length) return outcomes[index];
  return null;
}

/**
 * Votes and resolution. There is no scheduler: a voting case is settled whenever it is listed, read or voted on,
 * once every juror voted or the clock reached every juror's deadline. The clock is read once per operation and passed
 * down, so one request never sees two different times.
 */
@Injectable()
export class VotingService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Settles the given cases that are due; cases not in `voting` are left untouched. */
  async settle(caseIds: number[]): Promise<void> {
    if (!caseIds.length) return;
    const now = this.clock();
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.findBy(Case, { id: In(caseIds), status: 'voting' });
      for (const row of rows) await this.settleOne(manager, row, now);
    });
  }

  /**
   * Stores `userId`'s final vote. The caller has checked visibility, panel membership and the index range.
   * A late vote still settles the case before it is rejected, so the error is not rolled back with the settlement.
   */
  async cast(caseId: number, userId: number, outcomeIndex: number): Promise<void> {
    const now = this.clock();
    const rejection = await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOneByOrFail(Case, { id: caseId });
      const seat = await manager.findOneByOrFail(CaseJuror, { caseId, userId });
      if (isPastDeadline(seat, now)) {
        if (row.status === 'voting') await this.settleOne(manager, row, now);
        return DEADLINE_PASSED;
      }
      if (row.status !== 'voting') return NOT_VOTING;
      // Conditional update: a concurrent second vote by the same juror cannot overwrite the first.
      const stored = await manager.update(
        CaseJuror,
        { id: seat.id, outcomeIndex: IsNull() },
        { outcomeIndex, votedAt: now },
      );
      if (!stored.affected) return ALREADY_VOTED;
      await this.settleOne(manager, row, now);
      return null;
    });
    if (rejection) throw new ConflictException(rejection);
  }

  private async settleOne(manager: EntityManager, row: Case, now: Date): Promise<void> {
    const panel = await manager.findBy(CaseJuror, { caseId: row.id });
    if (!isDue(panel, now)) return;
    await manager.update(
      Case,
      { id: row.id, status: 'voting' },
      { status: 'resolved', result: majority(row.outcomes, panel) },
    );
  }
}
