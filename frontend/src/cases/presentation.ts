import type { CaseStatus } from '../api';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_jurors: 'Awaiting jurors',
  voting: 'Voting',
  resolved: 'Resolved',
};

/** A resolved case without a winning outcome (split, tie or no votes) has a null result. */
export const resultLabel = (result: string | null) => result ?? 'No majority';
