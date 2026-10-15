import { isDue, isPastDeadline, majority, Seat } from '../src/cases/voting.service';

const DEADLINE = new Date('2030-01-01T00:02:00.000Z');
const BEFORE = new Date(DEADLINE.getTime() - 1);
const seat = (outcomeIndex: number | null, deadline = DEADLINE): Seat => ({ outcomeIndex, deadline });

describe('voting rules', () => {
  describe('isPastDeadline', () => {
    it('is false 1 ms before the deadline and true at it', () => {
      expect(isPastDeadline(seat(null), BEFORE)).toBe(false);
      expect(isPastDeadline(seat(null), DEADLINE)).toBe(true);
    });
  });

  describe('isDue', () => {
    it('waits while someone has not voted and a deadline is ahead', () => {
      expect(isDue([seat(0), seat(0), seat(null)], BEFORE)).toBe(false);
    });

    it('is due once every juror voted, even before the deadline', () => {
      expect(isDue([seat(0), seat(1), seat(0)], BEFORE)).toBe(true);
    });

    it('is due once every deadline passed, whatever was voted', () => {
      expect(isDue([seat(0), seat(null), seat(null)], DEADLINE)).toBe(true);
    });

    it('waits for the latest deadline when deadlines differ', () => {
      const later = new Date(DEADLINE.getTime() + 60_000);
      expect(isDue([seat(null), seat(null, later)], DEADLINE)).toBe(false);
    });

    it('is never due for an empty panel', () => {
      expect(isDue([], DEADLINE)).toBe(false);
    });
  });

  describe('majority', () => {
    const outcomes = ['A', 'B', 'C'];

    it.each([
      ['2 of 3 for A', [0, 0, 1], 'A'],
      ['2 of 2 cast, one abstains', [0, 0, null], 'A'],
      ['a single cast vote', [null, 1, null], 'B'],
      ['a tie of cast votes', [0, 1, null], null],
      ['a three-way split', [0, 1, 2], null],
      ['no votes at all', [null, null, null], null],
    ] as const)('%s → %s', (_label, votes, expected) => {
      expect(
        majority(
          outcomes,
          votes.map((v) => seat(v)),
        ),
      ).toBe(expected);
    });
  });
});
