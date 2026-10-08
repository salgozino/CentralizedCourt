import { describe, expect, test } from 'vitest';
import { emptyDraft, errorsFromServer, toNewCase, validateDraft, type CaseDraft } from './draft';

const valid = (): CaseDraft => ({
  ...emptyDraft(),
  title: 'Refund dispute',
  description: 'The item never arrived.',
  outcomes: ['Refund', 'No refund'],
});

describe('validateDraft', () => {
  test('a complete draft has no errors', () => {
    expect(validateDraft(valid())).toEqual({});
  });

  test('the empty draft flags title, description and both outcomes, but not the default window', () => {
    expect(validateDraft(emptyDraft())).toEqual({
      title: 'Title must have at least 3 characters.',
      description: 'Description is required.',
      outcomes: ['Outcome cannot be empty.', 'Outcome cannot be empty.'],
    });
  });

  test('trims before checking lengths', () => {
    expect(validateDraft({ ...valid(), title: '  ab  ' }).title).toBeDefined();
    expect(validateDraft({ ...valid(), title: '  abc  ' }).title).toBeUndefined();
    expect(validateDraft({ ...valid(), description: '   ' }).description).toBe('Description is required.');
  });

  test('accepts the exact maximum lengths and rejects one more', () => {
    expect(validateDraft({ ...valid(), title: 't'.repeat(200), description: 'd'.repeat(5000) })).toEqual({});
    expect(validateDraft({ ...valid(), title: 't'.repeat(201) }).title).toMatch(/at most 200/);
    expect(validateDraft({ ...valid(), description: 'd'.repeat(5001) }).description).toMatch(/at most 5000/);
    expect(validateDraft({ ...valid(), outcomes: ['A', 'b'.repeat(100)] })).toEqual({});
    expect(validateDraft({ ...valid(), outcomes: ['A', 'b'.repeat(101)] }).outcomes).toEqual([
      undefined,
      'Outcome must have at most 100 characters.',
    ]);
  });

  test('marks the later duplicate, ignoring case and spaces', () => {
    expect(validateDraft({ ...valid(), outcomes: ['Yes', 'No', ' yes '] }).outcomes).toEqual([
      undefined,
      undefined,
      'Duplicate outcome.',
    ]);
  });

  test('rejects fewer than 2 or more than 10 outcomes', () => {
    expect(validateDraft({ ...valid(), outcomes: ['A'] }).general).toMatch(/between 2 and 10/);
    const eleven = Array.from({ length: 11 }, (_, i) => `O${i}`);
    expect(validateDraft({ ...valid(), outcomes: eleven }).general).toMatch(/between 2 and 10/);
  });

  test.each([
    ['1 minute', { days: '0', hours: '0', minutes: '1' }],
    ['30 days', { days: '30', hours: '0', minutes: '0' }],
    ['spaces around numbers', { days: ' 1 ', hours: '0', minutes: '0' }],
  ])('accepts a window of %s', (_label, window) => {
    expect(validateDraft({ ...valid(), window })).toEqual({});
  });

  test('rejects a zero window and one over 30 days, marking all three parts', () => {
    for (const window of [
      { days: '0', hours: '0', minutes: '0' },
      { days: '30', hours: '0', minutes: '1' },
    ]) {
      expect(validateDraft({ ...valid(), window })).toEqual({
        window: 'Must be between 1 minute and 30 days.',
        windowParts: ['days', 'hours', 'minutes'],
      });
    }
  });

  test.each([
    ['hours', '24', 'Hours must be a whole number from 0 to 23.'],
    ['minutes', '60', 'Minutes must be a whole number from 0 to 59.'],
    ['days', '31', 'Days must be a whole number from 0 to 30.'],
    ['minutes', '', 'Minutes must be a whole number from 0 to 59.'],
    ['hours', '1.5', 'Hours must be a whole number from 0 to 23.'],
    ['hours', '-1', 'Hours must be a whole number from 0 to 23.'],
    ['days', 'abc', 'Days must be a whole number from 0 to 30.'],
  ] as const)('rejects %s = "%s"', (part, value, message) => {
    const draft = valid();
    draft.window = { ...draft.window, [part]: value };
    expect(validateDraft(draft)).toEqual({ window: message, windowParts: [part] });
  });
});

test('toNewCase trims text and converts the window to seconds', () => {
  const draft = {
    ...valid(),
    title: '  T  ',
    outcomes: [' A ', 'B'],
    window: { days: '1', hours: '12', minutes: '0' },
    panelSize: 5,
    selectionMethod: 'manual' as const,
  };
  expect(toNewCase(draft)).toEqual({
    title: 'T',
    description: 'The item never arrived.',
    outcomes: ['A', 'B'],
    voteWindowSeconds: 129_600,
    panelSize: 5,
    selectionMethod: 'manual',
  });
});

describe('errorsFromServer', () => {
  test('places issues on their fields', () => {
    const detail = [
      { type: 'too_small', loc: ['body', 'payload', 'title'], msg: 'Title too short' },
      { type: 'custom', loc: ['body', 'payload', 'outcomes', 1], msg: 'Bad outcome' },
      { type: 'too_big', loc: ['body', 'payload', 'voteWindowSeconds'], msg: 'Too long' },
    ];
    expect(errorsFromServer(detail, 2)).toEqual({
      title: 'Title too short',
      outcomes: [undefined, 'Bad outcome'],
      window: 'Too long',
      windowParts: ['days', 'hours', 'minutes'],
    });
  });

  test('sends issues without a field to the general message', () => {
    const detail = [
      { loc: ['body', 'payload', 'outcomes'], msg: 'Outcomes must be unique (case-insensitive)' },
      { loc: ['body', 'payload', 'panelSize'], msg: 'Panel size must be odd' },
    ];
    expect(errorsFromServer(detail, 2)).toEqual({
      general: 'The server rejected the case. Outcomes must be unique (case-insensitive) Panel size must be odd',
    });
  });

  test('falls back to a general message for an unexpected detail', () => {
    expect(errorsFromServer('Cannot parse request body', 2)).toEqual({ general: 'The server rejected the case.' });
    expect(errorsFromServer(undefined, 2)).toEqual({ general: 'The server rejected the case.' });
  });
});
