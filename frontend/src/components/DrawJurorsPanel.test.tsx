import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CaseDetailPage from './CaseDetailPage';
import DrawJurorsPanel from './DrawJurorsPanel';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  getCase: vi.fn(),
  drawJurors: vi.fn(),
}));
import { ApiError, drawJurors, getCase, type CaseDetail, type DrawResult } from '../api';
import { drawResult, votingCase } from '../cases/draw.fixtures';

const awaiting: CaseDetail = { ...votingCase, status: 'awaiting_jurors', jurors: [] };

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
        <Route
          path="/cases/:id"
          element={
            <CaseDetailPage
              user={{ id: awaiting.creatorId, email: 'owner@example.com', roles: ['creator', 'user'] }}
              onUnauthorized={onUnauthorized}
            />
          }
        />
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
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    expect(items[i]).toHaveTextContent(juror.name);
    expect(items[i]).toHaveTextContent(new Date(juror.deadline).toLocaleString());
    expect(items[i]).not.toHaveTextContent(/undefined|@/);
  });
  const keyWarnings = consoleError.mock.calls.filter((args) => String(args[0]).includes('unique "key"'));
  expect(keyWarnings).toEqual([]);
  consoleError.mockRestore();
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

test('cases that are already voting show no draw button', async () => {
  vi.mocked(getCase).mockResolvedValue(votingCase);
  await setup();
  expect(screen.queryByRole('button', { name: 'Draw jurors' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Assign jurors' })).not.toBeInTheDocument();
});

test('a loaded voting case shows its persisted panel in draw order with each deadline', async () => {
  vi.mocked(getCase).mockResolvedValue(votingCase);
  await setup();
  const items = within(screen.getByRole('list', { name: 'Drawn jurors' })).getAllByRole('listitem');
  expect(items).toHaveLength(votingCase.jurors.length);
  votingCase.jurors.forEach((juror, i) => {
    expect(items[i]).toHaveTextContent(juror.name);
    expect(items[i]).toHaveTextContent(new Date(juror.deadline).toLocaleString());
  });
  expect(drawJurors).not.toHaveBeenCalled();
});

test('a case awaiting jurors shows no drawn jurors list', async () => {
  await setup();
  expect(screen.queryByRole('list', { name: 'Drawn jurors' })).not.toBeInTheDocument();
});

test.each([{ assignmentHistory: undefined }, { assignmentHistory: [] }])(
  'renders refusal jurors safely when history is missing or empty ($assignmentHistory)',
  ({ assignmentHistory }) => {
    render(
      <DrawJurorsPanel
        value={{ ...votingCase, status: 'refusal', assignmentHistory }}
        canDraw={false}
        onDrawn={vi.fn()}
        onUnauthorized={vi.fn()}
      />,
    );
    const list = screen.getByRole('list', { name: 'Drawn jurors' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(votingCase.jurors.length);
    expect(within(list).getAllByText(/Refusal deadline unavailable/)).toHaveLength(votingCase.jurors.length);
    expect(list).not.toHaveTextContent(/Invalid Date|Vote by/);
  },
);
