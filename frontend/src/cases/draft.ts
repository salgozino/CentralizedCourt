import type { NewCase, SelectionMethod, ValidationIssue } from '../api';
import { toSeconds } from './duration';

// Limits mirror backend/src/cases/dto.ts; keep both in sync.
export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const OUTCOMES_MIN = 2;
export const OUTCOMES_MAX = 10;
export const OUTCOME_MAX = 100;
export const WINDOW_MIN_SECONDS = 60;
export const WINDOW_MAX_SECONDS = 30 * 86_400;
export const PANEL_SIZES = [1, 3, 5, 7, 9, 11] as const;

export const WINDOW_PARTS = [
  { key: 'days', label: 'Days', max: 30 },
  { key: 'hours', label: 'Hours', max: 23 },
  { key: 'minutes', label: 'Minutes', max: 59 },
] as const;
export type WindowPart = (typeof WINDOW_PARTS)[number]['key'];

/** The form as typed: number inputs are kept as strings so invalid input can be shown back. */
export type CaseDraft = {
  title: string;
  description: string;
  outcomes: string[];
  window: Record<WindowPart, string>;
  panelSize: number;
  selectionMethod: SelectionMethod;
};

export type DraftErrors = {
  title?: string;
  description?: string;
  /** Per outcome, same order as the draft. */
  outcomes?: Array<string | undefined>;
  window?: string;
  windowParts?: WindowPart[];
  /** Anything that cannot be shown next to a field. */
  general?: string;
};

export const emptyDraft = (): CaseDraft => ({
  title: '',
  description: '',
  outcomes: ['', ''],
  window: { days: '0', hours: '0', minutes: '2' },
  panelSize: 3,
  selectionMethod: 'random',
});

const wholeNumber = (raw: string): number | null => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);

function validateWindow(window: CaseDraft['window']): Pick<DraftErrors, 'window' | 'windowParts'> {
  for (const { key, label, max } of WINDOW_PARTS) {
    const value = wholeNumber(window[key]);
    if (value === null || value > max)
      return { window: `${label} must be a whole number from 0 to ${max}.`, windowParts: [key] };
  }
  const seconds = draftWindowSeconds(window);
  if (seconds < WINDOW_MIN_SECONDS || seconds > WINDOW_MAX_SECONDS)
    return { window: 'Must be between 1 minute and 30 days.', windowParts: WINDOW_PARTS.map((p) => p.key) };
  return {};
}

function validateOutcomes(outcomes: string[]): Array<string | undefined> | undefined {
  const seen = new Set<string>();
  const errors = outcomes.map((raw) => {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (!label) return 'Outcome cannot be empty.';
    if (label.length > OUTCOME_MAX) return `Outcome must have at most ${OUTCOME_MAX} characters.`;
    if (seen.has(key)) return 'Duplicate outcome.';
    seen.add(key);
    return undefined;
  });
  return errors.some(Boolean) ? errors : undefined;
}

export function draftWindowSeconds(window: CaseDraft['window']): number {
  return toSeconds({
    days: wholeNumber(window.days) ?? 0,
    hours: wholeNumber(window.hours) ?? 0,
    minutes: wholeNumber(window.minutes) ?? 0,
  });
}

/** Same rules as the backend. Returns only the fields that have an error. */
export function validateDraft(draft: CaseDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title.length < TITLE_MIN) errors.title = `Title must have at least ${TITLE_MIN} characters.`;
  else if (title.length > TITLE_MAX) errors.title = `Title must have at most ${TITLE_MAX} characters.`;

  const description = draft.description.trim();
  if (!description) errors.description = 'Description is required.';
  else if (description.length > DESCRIPTION_MAX)
    errors.description = `Description must have at most ${DESCRIPTION_MAX} characters.`;

  if (draft.outcomes.length < OUTCOMES_MIN || draft.outcomes.length > OUTCOMES_MAX)
    errors.general = `A case needs between ${OUTCOMES_MIN} and ${OUTCOMES_MAX} outcomes.`;
  const outcomes = validateOutcomes(draft.outcomes);
  if (outcomes) errors.outcomes = outcomes;

  Object.assign(errors, validateWindow(draft.window));
  return errors;
}

export const hasErrors = (errors: DraftErrors): boolean => Object.keys(errors).length > 0;

/** Call only on a draft without errors. */
export const toNewCase = (draft: CaseDraft): NewCase => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  outcomes: draft.outcomes.map((o) => o.trim()),
  voteWindowSeconds: draftWindowSeconds(draft.window),
  panelSize: draft.panelSize,
  selectionMethod: draft.selectionMethod,
});

const isIssue = (value: unknown): value is ValidationIssue =>
  typeof value === 'object' && value !== null && Array.isArray((value as ValidationIssue).loc);

/** Maps a 422 `detail` to the fields of the form; whatever cannot be placed goes to `general`. */
export function errorsFromServer(detail: unknown, outcomeCount: number): DraftErrors {
  const errors: DraftErrors = {};
  const unplaced: string[] = [];
  for (const issue of Array.isArray(detail) ? detail : []) {
    if (!isIssue(issue)) continue;
    const [, , field, index] = issue.loc;
    if (field === 'title' || field === 'description') errors[field] ??= issue.msg;
    else if (field === 'voteWindowSeconds') {
      errors.window ??= issue.msg;
      errors.windowParts = WINDOW_PARTS.map((p) => p.key);
    } else if (field === 'outcomes' && typeof index === 'number' && index < outcomeCount) {
      errors.outcomes ??= Array.from({ length: outcomeCount }, () => undefined);
      errors.outcomes[index] ??= issue.msg;
    } else unplaced.push(issue.msg);
  }
  if (unplaced.length || !hasErrors(errors)) errors.general = ['The server rejected the case.', ...unplaced].join(' ');
  return errors;
}
