import type { CaseStatus } from '../api';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_jurors: 'Awaiting jurors',
  voting: 'Voting',
  resolved: 'Resolved',
};
