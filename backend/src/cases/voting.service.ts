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

  /**
   * Whether the user sits on the panel of a case that is still voting (even after voting there). Due cases are
   * settled first, so an expired case does not count as active.
   */
  async isOnActiveCase(userId: number): Promise<boolean> {
    const openSeats = () =>
      this.dataSource.getRepository(CaseJuror).find({
        where: [
          { userId, refusedAt: IsNull(), case: { status: 'voting' } },
          { userId, refusedAt: IsNull(), case: { status: 'refusal' } },
        ],
        relations: { case: true },
      });
    const seats = await openSeats();
    if (!seats.length) return false;
    await this.settle(seats.map((s) => s.caseId));
    return (await openSeats()).length > 0;
  }

  /** Advances refusal at its logical cutoff, then resolves voting cases that are due. */
  async settle(caseIds: number[]): Promise<void> {
    if (!caseIds.length) return;
    const now = this.clock();
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.findBy(Case, { id: In(caseIds), status: In(['voting', 'refusal']) });
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
      await this.openVoting(manager, row, now);
      if (row.status === 'refusal') return NOT_VOTING;
      const seat = await manager.findOneByOrFail(CaseJuror, { caseId, userId, refusedAt: IsNull() });
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

  private async openVoting(manager: EntityManager, row: Case, now: Date): Promise<void> {
    if (row.status !== 'refusal') return;
    const panel = await manager.findBy(CaseJuror, { caseId: row.id, refusedAt: IsNull() });
    if (panel.length !== row.panelSize || panel.some((j) => !j.refusalDeadline || j.refusalDeadline > now)) return;
    const start = Math.max(...panel.map((j) => j.refusalDeadline!.getTime()));
    await manager.update(
      CaseJuror,
      { caseId: row.id, refusedAt: IsNull() },
      { deadline: new Date(start + row.voteWindowSeconds * 1000) },
    );
    await manager.update(Case, { id: row.id, status: 'refusal' }, { status: 'voting' });
    row.status = 'voting';
  }

  private async settleOne(manager: EntityManager, row: Case, now: Date): Promise<void> {
    await this.openVoting(manager, row, now);
    if (row.status !== 'voting') return;
    const panel = await manager.findBy(CaseJuror, { caseId: row.id, refusedAt: IsNull() });
    if (!isDue(panel, now)) return;
    await manager.update(
      Case,
      { id: row.id, status: 'voting' },
      { status: 'resolved', result: majority(row.outcomes, panel) },
    );
  }
}
