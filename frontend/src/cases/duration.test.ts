import { expect, test } from 'vitest';
import { formatDuration, toSeconds } from './duration';

test('converts days, hours and minutes to seconds', () => {
  expect(toSeconds({ days: 0, hours: 0, minutes: 2 })).toBe(120);
  expect(toSeconds({ days: 1, hours: 12, minutes: 0 })).toBe(129_600);
  expect(toSeconds({ days: 30, hours: 0, minutes: 0 })).toBe(2_592_000);
});

test.each([
  [60, '1 minute'],
  [120, '2 minutes'],
  [3_600, '1 hour'],
  [5_400, '1 hour 30 minutes'],
  [129_600, '1 day 12 hours'],
  [90_061, '1 day 1 hour 1 minute'],
  [2_592_000, '30 days'],
  [0, '0 minutes'],
])('formats %i seconds as "%s"', (seconds, text) => {
  expect(formatDuration(seconds)).toBe(text);
});
