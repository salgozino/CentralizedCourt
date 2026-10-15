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
  [422, 'outcomeIndex must refer to one of the case outcomes'],
  [500, 'Could not cast your vote. Please try again.'],
])('shows the error of a %i and keeps the form', async (status, shown) => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(status, 'failed', status === 422 ? shown : undefined));
  const { events } = await setup(juror1);
  await events.click(screen.getByRole('radio', { name: 'Buyer' }));
  await events.click(castButton()!);
  expect(await screen.findByRole('alert')).toHaveTextContent(shown);
  expect(castButton()).toBeEnabled();
  expect(getCase).toHaveBeenCalledTimes(1);
});

test('a 409 for an earlier vote reloads the case and shows the stored vote', async () => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(409, 'failed', 'You have already voted'));
  const { events } = await setup(juror1);
  vi.mocked(getCase).mockResolvedValue(withVotes(open, [0, null, null]));
  await events.click(screen.getByRole('radio', { name: 'Seller' }));
  await events.click(castButton()!);
  const vote = screen.getByRole('region', { name: 'Your vote' });
  expect(await within(vote).findByRole('alert')).toHaveTextContent('You have already voted');
  expect(within(vote).getByText('You voted: Buyer')).toBeInTheDocument();
  expect(castButton()).toBeNull();
  expect(getCase).toHaveBeenCalledTimes(2);
  expect(jurorItems()[0]).toHaveTextContent(/Voted/);
});

test('a 409 after the deadline reloads the case and shows it resolved', async () => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(409, 'failed', 'The voting deadline has passed'));
  const { events } = await setup(juror1);
  vi.mocked(getCase).mockResolvedValue(withVotes(open, [null, null, null], { status: 'resolved', result: null }));
  await events.click(screen.getByRole('radio', { name: 'Buyer' }));
  await events.click(castButton()!);
  expect(await screen.findByRole('alert')).toHaveTextContent('The voting deadline has passed');
  expect(screen.getByRole('region', { name: 'Result' })).toHaveTextContent('Resolved: No majority');
  expect(castButton()).toBeNull();
  expect(jurorItems()[0]).toHaveTextContent('Did not vote');
});

test('a 409 keeps the form when reloading the case fails', async () => {
  vi.mocked(castVote).mockRejectedValue(new ApiError(409, 'failed', 'You have already voted'));
  const { events } = await setup(juror1);
  vi.mocked(getCase).mockRejectedValue(new ApiError(500, 'failed'));
  await events.click(screen.getByRole('radio', { name: 'Buyer' }));
  await events.click(castButton()!);
  expect(await screen.findByRole('alert')).toHaveTextContent('You have already voted');
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
  // Deadlines no longer matter once resolved.
  for (const item of jurorItems()) expect(item).not.toHaveTextContent('Vote by');
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
