import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseDetailPage from './CaseDetailPage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  getCase: vi.fn(),
  drawJurors: vi.fn(),
}));
import { ApiError, drawJurors, getCase, type Case, type DrawResult } from '../api';
import { drawResult, votingCase } from '../cases/draw.fixtures';

const awaiting: Case = { ...votingCase, status: 'awaiting_jurors' };

beforeEach(() => {
  vi.mocked(getCase).mockReset().mockResolvedValue(awaiting);
  vi.mocked(drawJurors).mockReset();
});

async function setup() {
  const onUnauthorized = vi.fn();
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/cases/${awaiting.id}`]}>
      <Routes>
        <Route path="/cases/:id" element={<CaseDetailPage onUnauthorized={onUnauthorized} />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: awaiting.title });
  return { user, onUnauthorized };
}

test('draws a random jury, shows the pending state, then the case as voting with the jurors in order', async () => {
  let resolve!: (result: DrawResult) => void;
  vi.mocked(drawJurors).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { user } = await setup();
  expect(screen.getAllByText('Awaiting jurors').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: 'Draw jurors' }));
  expect(drawJurors).toHaveBeenCalledWith(awaiting.id);
  expect(screen.getByRole('button', { name: 'Drawing jurors…' })).toBeDisabled();

  resolve(drawResult);
  const list = await screen.findByRole('list', { name: 'Drawn jurors' });
  const items = within(list).getAllByRole('listitem');
  expect(items).toHaveLength(drawResult.jurors.length);
  drawResult.jurors.forEach((juror, i) => {
    expect(items[i]).toHaveTextContent(juror.email);
    expect(items[i]).toHaveTextContent(new Date(juror.deadline).toLocaleString());
  });
  expect(screen.getAllByText('Voting').length).toBeGreaterThan(0);
  expect(screen.queryByText('Awaiting jurors')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Draw/ })).not.toBeInTheDocument();
});

test.each([
  [403, 'Only the case creator or an admin can draw jurors'],
  [409, 'Not enough eligible jurors: 3 required, 2 available'],
])('shows the backend detail on a %i error and lets the user retry', async (status, detail) => {
  vi.mocked(drawJurors).mockRejectedValueOnce(new ApiError(status, 'failed', detail));
  const { user, onUnauthorized } = await setup();
  await user.click(screen.getByRole('button', { name: 'Draw jurors' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(detail);
  expect(screen.getByRole('button', { name: 'Draw jurors' })).toBeEnabled();
  expect(screen.getAllByText('Awaiting jurors').length).toBeGreaterThan(0);
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('shows the validation messages on a 422 error', async () => {
  vi.mocked(drawJurors).mockRejectedValueOnce(
    new ApiError(422, 'failed', [{ loc: ['body', 'jurorIds'], msg: 'jurorIds is not allowed for random cases' }]),
  );
  const { user } = await setup();
  await user.click(screen.getByRole('button', { name: 'Draw jurors' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('jurorIds is not allowed for random cases');
});

test('falls back to a generic message when the error has no detail', async () => {
  vi.mocked(drawJurors).mockRejectedValueOnce(new TypeError('Network'));
  const { user } = await setup();
  await user.click(screen.getByRole('button', { name: 'Draw jurors' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not draw jurors. Please try again.');
});

test('a 401 calls onUnauthorized', async () => {
  vi.mocked(drawJurors).mockRejectedValueOnce(new ApiError(401, 'failed', 'Not authenticated'));
  const { user, onUnauthorized } = await setup();
  await user.click(screen.getByRole('button', { name: 'Draw jurors' }));
  await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
});

test('manual cases awaiting jurors show a note and no draw button', async () => {
  vi.mocked(getCase).mockResolvedValue({ ...awaiting, selectionMethod: 'manual' });
  await setup();
  expect(screen.getByText('Manual juror assignment is not available yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Draw jurors' })).not.toBeInTheDocument();
});

test('cases that are already voting show no draw button', async () => {
  vi.mocked(getCase).mockResolvedValue(votingCase);
  await setup();
  expect(screen.queryByRole('button', { name: 'Draw jurors' })).not.toBeInTheDocument();
  expect(screen.queryByText('Manual juror assignment is not available yet.')).not.toBeInTheDocument();
});
