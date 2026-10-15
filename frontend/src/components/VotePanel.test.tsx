import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseDetailPage from './CaseDetailPage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  getCase: vi.fn(),
  castVote: vi.fn(),
}));
import { ApiError, castVote, getCase, type CaseDetail, type User } from '../api';
import { drawnJurors, votingCase } from '../cases/draw.fixtures';

// Juror 1 (id 5) is first on the panel; the deadline is still ahead.
const FUTURE = '2099-01-01T00:00:00.000Z';
const open: CaseDetail = { ...votingCase, jurors: drawnJurors.map((j) => ({ ...j, deadline: FUTURE })) };
const juror1: User = { id: 5, email: 'juror1@example.com', roles: ['juror', 'user'] };
const owner: User = { id: votingCase.creatorId, email: 'owner@example.com', roles: ['creator', 'user'] };

const withVotes = (c: CaseDetail, votes: (number | null)[], extra: Partial<CaseDetail> = {}): CaseDetail => ({
  ...c,
  ...extra,
  jurors: c.jurors.map((j, i) => ({ ...j, hasVoted: votes[i] !== null, outcomeIndex: votes[i] })),
});

beforeEach(() => {
  vi.mocked(getCase).mockReset().mockResolvedValue(open);
  vi.mocked(castVote).mockReset();
});

async function setup(user: User) {
  const onUnauthorized = vi.fn();
  const events = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/cases/${votingCase.id}`]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseDetailPage user={user} onUnauthorized={onUnauthorized} />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: votingCase.title });
  return { events, onUnauthorized };
}

const jurorItems = () => within(screen.getByRole('list', { name: 'Drawn jurors' })).getAllByRole('listitem');
const castButton = () => screen.queryByRole('button', { name: /Cast vote|Casting vote/ });

test('a panel juror picks an outcome and casts a final vote', async () => {
  vi.mocked(castVote).mockResolvedValue(withVotes(open, [1, null, null]));
  const { events } = await setup(juror1);
  const vote = screen.getByRole('region', { name: 'Your vote' });
  expect(castButton()).toBeDisabled();
  await events.click(within(vote).getByRole('radio', { name: 'Seller' }));
  await events.click(castButton()!);
  expect(castVote).toHaveBeenCalledWith(votingCase.id, 1);
  expect(await within(vote).findByText('You voted: Seller')).toBeInTheDocument();
  expect(castButton()).toBeNull();
  expect(jurorItems()[0]).toHaveTextContent(/Voted/);
  expect(jurorItems()[1]).toHaveTextContent(/Pending/);
});

test('a juror who already voted sees their choice and no form', async () => {
  vi.mocked(getCase).mockResolvedValue(withVotes(open, [0, null, null]));
  await setup(juror1);
  expect(screen.getByRole('region', { name: 'Your vote' })).toHaveTextContent('You voted: Buyer');
  expect(castButton()).toBeNull();
});

test('a juror past their deadline cannot vote', async () => {
  vi.mocked(getCase).mockResolvedValue(votingCase);
  await setup(juror1);
  expect(screen.getByRole('region', { name: 'Your vote' })).toHaveTextContent('Your voting deadline has passed.');
  expect(castButton()).toBeNull();
});

test('readers outside the panel only see who voted, not what', async () => {
  // The backend hides other jurors' choices while voting: hasVoted without outcomeIndex.
  const hidden = withVotes(open, [null, null, null]);
  vi.mocked(getCase).mockResolvedValue({
    ...hidden,
    jurors: hidden.jurors.map((j, i) => (i === 0 ? { ...j, hasVoted: true } : j)),
  });
  await setup(owner);
  expect(screen.queryByRole('region', { name: 'Your vote' })).toBeNull();
  expect(castButton()).toBeNull();
  expect(jurorItems()[0]).toHaveTextContent(/Juror 1.*Voted/);
  expect(jurorItems()[0]).not.toHaveTextContent(/Buyer|Seller/);
  expect(jurorItems()[1]).toHaveTextContent(/Juror 4.*Pending/);
});

test.each([
  [409, 'You have already voted'],
  [409, 'The voting deadline has passed'],
])('shows the backend detail of a %i error and keeps the form', async (status, detail) => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(status, 'failed', detail));
  const { events } = await setup(juror1);
  await events.click(screen.getByRole('radio', { name: 'Buyer' }));
  await events.click(castButton()!);
  expect(await screen.findByRole('alert')).toHaveTextContent(detail);
  expect(castButton()).toBeEnabled();
});

test('a 401 while voting returns to login', async () => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(401, 'failed', 'Unauthorized'));
  const { events, onUnauthorized } = await setup(juror1);
  await events.click(screen.getByRole('radio', { name: 'Buyer' }));
  await events.click(castButton()!);
  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
});

test('a resolved case shows the result and every juror vote', async () => {
  vi.mocked(getCase).mockResolvedValue(withVotes(open, [0, 1, null], { status: 'resolved', result: 'Buyer' }));
  await setup(owner);
  expect(screen.getByRole('region', { name: 'Result' })).toHaveTextContent('Resolved: Buyer');
  expect(jurorItems().map((item) => item.textContent)).toEqual([
    expect.stringMatching(/Juror 1.*Voted Buyer/),
    expect.stringMatching(/Juror 4.*Voted Seller/),
    expect.stringMatching(/Juror 2.*Did not vote/),
  ]);
  expect(castButton()).toBeNull();
});

test('a resolved case without a majority says so', async () => {
  vi.mocked(getCase).mockResolvedValue(withVotes(open, [0, 1, null], { status: 'resolved', result: null }));
  await setup(juror1);
  expect(screen.getByRole('region', { name: 'Result' })).toHaveTextContent('Resolved: No majority');
  expect(screen.queryByRole('region', { name: 'Your vote' })).toBeNull();
});
