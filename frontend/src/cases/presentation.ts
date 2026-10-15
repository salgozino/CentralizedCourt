import { ApiError, type CaseStatus, type ValidationIssue } from '../api';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  awaiting_jurors: 'Awaiting jurors',
  refusal: 'Refusal period',
  voting: 'Voting',
  resolved: 'Resolved',
};

/** "1 juror", "3 jurors". */
export const jurorCount = (n: number) => `${n} juror${n === 1 ? '' : 's'}`;

/** A resolved case without a winning outcome (split, tie or no votes) has a null result. */
export const resultLabel = (result: string | null) => result ?? 'No majority';

/** The backend `detail` is a message string, or a list of validation issues on 422; anything else gets `fallback`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (typeof error.detail === 'string') return error.detail;
  if (Array.isArray(error.detail)) return (error.detail as ValidationIssue[]).map((issue) => issue.msg).join(' ');
  return fallback;
}
