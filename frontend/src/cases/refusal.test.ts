import { describe, expect, it } from 'vitest';
import { emptyDraft, toNewCase, validateDraft } from './draft';

describe('manual refusal configuration', () => {
  it('supplies the 24-hour default only for manual cases', () => {
    const draft = emptyDraft();
    expect(toNewCase(draft)).not.toHaveProperty('refusalWindowSeconds');
    draft.selectionMethod = 'manual';
    expect(toNewCase(draft)).toHaveProperty('refusalWindowSeconds', 86400);
  });
  it('validates refusal duration separately from voting', () => {
    const draft = {
      ...emptyDraft(),
      title: 'Test case',
      description: 'Details',
      outcomes: ['A', 'B'],
      selectionMethod: 'manual' as const,
      refusalWindow: { days: '0', hours: '0', minutes: '0' },
    };
    expect(validateDraft(draft)).toHaveProperty('refusalWindow');
  });
});
