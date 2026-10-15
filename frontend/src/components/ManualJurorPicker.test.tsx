import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseDetailPage from './CaseDetailPage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  getCase: vi.fn(),
  drawJurors: vi.fn(),
  listEligibleJurors: vi.fn(),
}));
import { ApiError, drawJurors, getCase, listEligibleJurors, type CaseDetail, type User } from '../api';
import { drawResult, votingCase } from '../cases/draw.fixtures';

const manual: CaseDetail = { ...votingCase, status: 'awaiting_jurors', selectionMethod: 'manual', jurors: [] };
const eligible = [
  { jurorId: 4, name: 'Juror 1' },
  { jurorId: 5, name: 'Juror 2' },
  { jurorId: 6, name: 'Juror 3' },
  { jurorId: 7, name: 'Juror 4' },
];
const owner: User = { id: manual.creatorId, email: 'owner@example.com', roles: ['creator', 'user'] };
const juror: User = { id: 4, email: 'juror1@example.com', roles: ['juror', 'user'] };

beforeEach(() => {
  vi.mocked(getCase).mockReset().mockResolvedValue(manual);
  vi.mocked(drawJurors).mockReset();
  vi.mocked(listEligibleJurors).mockReset().mockResolvedValue(eligible);
});

async function setup(user: User = owner) {
  const onUnauthorized = vi.fn();
  const events = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/cases/${manual.id}`]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseDetailPage user={user} onUnauthorized={onUnauthorized} />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: manual.title });
  return { events, onUnauthorized };
}

const assign = () => screen.queryByRole('button', { name: /Assign jurors|Assigning jurors/ });
const box = (name: string) => screen.getByRole('checkbox', { name });

test('the creator picks exactly panelSize jurors in order and assigns them', async () => {
  vi.mocked(drawJurors).mockResolvedValue(drawResult);
  const { events } = await setup();
  const list = await screen.findByRole('list', { name: 'Eligible jurors' });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Juror 1', 'Juror 2', 'Juror 3', 'Juror 4']);
  expect(listEligibleJurors).toHaveBeenCalledWith(manual.id);
  expect(assign()).toBeDisabled();

  await events.click(box('Juror 4'));
  await events.click(box('Juror 1'));
  expect(screen.getByText('Selected 2 of 3: Juror 4, Juror 1')).toBeInTheDocument();
  expect(assign()).toBeDisabled();
  await events.click(box('Juror 3'));
  expect(screen.getByText('Selected 3 of 3: Juror 4, Juror 1, Juror 3')).toBeInTheDocument();
  // A full panel blocks further picks until one is removed.
  expect(box('Juror 2')).toBeDisabled();
  expect(assign()).toBeEnabled();

  await events.click(assign()!);
  expect(drawJurors).toHaveBeenCalledWith(manual.id, [7, 4, 6]);
  expect(await screen.findByRole('list', { name: 'Drawn jurors' })).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Eligible jurors' })).toBeNull();
});

test('unchecking a juror removes them from the order and frees a slot', async () => {
  const { events } = await setup();
  await screen.findByRole('list', { name: 'Eligible jurors' });
  for (const name of ['Juror 2', 'Juror 1', 'Juror 3']) await events.click(box(name));
  await events.click(box('Juror 1'));
  expect(screen.getByText('Selected 2 of 3: Juror 2, Juror 3')).toBeInTheDocument();
  expect(box('Juror 4')).toBeEnabled();
  expect(assign()).toBeDisabled();
});

test('shows the backend detail when the assignment fails and keeps the picks', async () => {
  vi.mocked(drawJurors).mockRejectedValue(
    new ApiError(422, 'failed', 'Only users with the juror role can be assigned'),
  );
  const { events } = await setup();
  await screen.findByRole('list', { name: 'Eligible jurors' });
  for (const name of ['Juror 1', 'Juror 2', 'Juror 3']) await events.click(box(name));
  await events.click(assign()!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Only users with the juror role can be assigned');
  expect(box('Juror 1')).toBeChecked();
  expect(assign()).toBeEnabled();
});

test('a failed list load can be retried', async () => {
  vi.mocked(listEligibleJurors).mockRejectedValueOnce(new ApiError(500, 'failed'));
  const { events } = await setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load eligible jurors.');
  await events.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('list', { name: 'Eligible jurors' })).toBeInTheDocument();
});

test('explains when there are fewer eligible jurors than seats', async () => {
  vi.mocked(listEligibleJurors).mockResolvedValue(eligible.slice(0, 2));
  await setup();
  expect(await screen.findByText('Only 2 eligible jurors for 3 seats.')).toBeInTheDocument();
  expect(assign()).toBeDisabled();
});

test('a 401 while assigning returns to login', async () => {
  vi.mocked(drawJurors).mockRejectedValue(new ApiError(401, 'failed', 'Unauthorized'));
  const { events, onUnauthorized } = await setup();
  await screen.findByRole('list', { name: 'Eligible jurors' });
  for (const name of ['Juror 1', 'Juror 2', 'Juror 3']) await events.click(box(name));
  await events.click(assign()!);
  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
});

test('readers who cannot assign see a waiting note and never load the list', async () => {
  await setup(juror);
  expect(screen.getByText('This case is waiting for the creator to assign 3 jurors.')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Eligible jurors' })).toBeNull();
  expect(assign()).toBeNull();
  expect(listEligibleJurors).not.toHaveBeenCalled();
});
