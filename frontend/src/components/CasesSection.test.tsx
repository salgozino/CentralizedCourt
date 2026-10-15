import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CasesSection, { NewCase as NewCasePage } from './CasesSection';
import CaseDetailPage from './CaseDetailPage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  createCase: vi.fn(),
  listCases: vi.fn().mockResolvedValue([]),
  getCase: vi.fn(),
}));
import { ApiError, createCase, listCases, type Case, type NewCase } from '../api';

beforeEach(() => {
  vi.mocked(createCase).mockReset();
});

const stored = (input: NewCase, extra: Partial<Case> = {}): Case => ({
  ...input,
  id: 42,
  creatorId: 2,
  status: 'awaiting_jurors',
  result: null,
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
  ...extra,
});

function setup(canCreate = true) {
  const onUnauthorized = vi.fn();
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/cases']}>
      <Routes>
        <Route path="/cases/*" element={<CasesSection canCreate={canCreate} onUnauthorized={onUnauthorized} />} />
        <Route path="/cases/new" element={<NewCasePage canCreate={canCreate} onUnauthorized={onUnauthorized} />} />
        <Route
          path="/cases/:id"
          element={
            <CaseDetailPage
              user={{ id: 2, email: 'owner@example.com', roles: ['creator', 'user'] }}
              onUnauthorized={onUnauthorized}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { user, onUnauthorized };
}

const newCaseButton = () => screen.queryByRole('button', { name: 'New case' });
const submitButton = () => screen.getByRole('button', { name: /Create case|Creating/ });
const outcome = (n: number) => screen.getByRole('textbox', { name: `Outcome ${n}` });

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(newCaseButton()!);
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Refund dispute');
  await user.type(screen.getByRole('textbox', { name: 'Description' }), 'The item never arrived.');
  await user.type(outcome(1), 'Refund');
  await user.type(outcome(2), 'No refund');
}

const expectedInput: NewCase = {
  title: 'Refund dispute',
  description: 'The item never arrived.',
  outcomes: ['Refund', 'No refund'],
  voteWindowSeconds: 120,
  panelSize: 3,
  selectionMethod: 'random',
};

test('the list shows the result of resolved cases, including no majority', async () => {
  vi.mocked(listCases).mockResolvedValueOnce([
    stored(expectedInput, { id: 1, title: 'Won', status: 'resolved', result: 'Refund' }),
    stored(expectedInput, { id: 2, title: 'Split', status: 'resolved', result: null }),
    stored(expectedInput, { id: 3, title: 'Open', status: 'voting', result: null }),
  ]);
  setup();
  const items = within(await screen.findByRole('list', { name: 'Cases' })).getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('Result: Refund');
  expect(items[1]).toHaveTextContent('Result: No majority');
  expect(items[2]).not.toHaveTextContent('Result:');
});

test('without the role, New case is disabled and explained', async () => {
  setup(false);
  expect(newCaseButton()).toBeDisabled();
  expect(newCaseButton()).toHaveAccessibleDescription('Only creators and admins can create cases.');
  expect(await screen.findByRole('heading', { name: 'No cases to show' })).toBeInTheDocument();
});

test('New case opens the form and hides itself; Cancel goes back', async () => {
  const { user } = setup();
  expect(newCaseButton()).toBeEnabled();
  await user.click(newCaseButton()!);
  expect(screen.getByRole('form', { name: 'New case' })).toBeInTheDocument();
  expect(newCaseButton()).toBeNull();
  expect(screen.queryByText('Case list coming soon.')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('form')).toBeNull();
  expect(newCaseButton()).toBeInTheDocument();
});

test('the empty form starts with two outcomes and a 2-minute window, without errors', async () => {
  const { user } = setup();
  await user.click(newCaseButton()!);
  expect(screen.getAllByRole('textbox', { name: /^Outcome/ })).toHaveLength(2);
  expect(screen.getByRole('textbox', { name: 'Days' })).toHaveValue('0');
  expect(screen.getByRole('textbox', { name: 'Hours' })).toHaveValue('0');
  expect(screen.getByRole('textbox', { name: 'Minutes' })).toHaveValue('2');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Title' })).not.toHaveAttribute('aria-invalid', 'true');
});

test('submitting an empty form shows errors, focuses the first one and does not call the API', async () => {
  const { user } = setup();
  await user.click(newCaseButton()!);
  await user.click(submitButton());

  const title = screen.getByRole('textbox', { name: 'Title' });
  expect(title).toHaveAttribute('aria-invalid', 'true');
  expect(title).toHaveAccessibleDescription(expect.stringContaining('Title must have at least 3 characters.'));
  expect(screen.getByText('Description is required.')).toBeInTheDocument();
  expect(screen.getAllByText('Outcome cannot be empty.')).toHaveLength(2);
  await waitFor(() => expect(title).toHaveFocus());
  expect(createCase).not.toHaveBeenCalled();

  // After the first attempt errors follow the edits.
  await user.type(title, 'Fixed title');
  expect(title).not.toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByText('Title must have at least 3 characters.')).toBeNull();
});

test('flags a duplicate outcome and an out-of-range window', async () => {
  const { user } = setup();
  await openAndFill(user);
  await user.clear(outcome(2));
  await user.type(outcome(2), ' refund ');
  const minutes = screen.getByRole('textbox', { name: 'Minutes' });
  await user.clear(minutes);
  await user.type(minutes, '0');
  await user.click(submitButton());

  expect(outcome(1)).not.toHaveAttribute('aria-invalid', 'true');
  expect(outcome(2)).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('Duplicate outcome.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Must be between 1 minute and 30 days.');
  for (const name of ['Days', 'Hours', 'Minutes'])
    expect(screen.getByRole('textbox', { name })).toHaveAttribute('aria-invalid', 'true');
  expect(createCase).not.toHaveBeenCalled();
});

test('outcomes can be added up to 10 and removed down to 2', async () => {
  const { user } = setup();
  await user.click(newCaseButton()!);
  expect(screen.getByRole('button', { name: 'Remove outcome 1' })).toBeDisabled();
  for (let i = 0; i < 8; i++) await user.click(screen.getByRole('button', { name: '+ Add outcome' }));
  expect(screen.getAllByRole('textbox', { name: /^Outcome/ })).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Maximum 10 outcomes' })).toBeDisabled();

  await user.type(outcome(3), 'third');
  await user.click(screen.getByRole('button', { name: 'Remove outcome 2' }));
  expect(screen.getAllByRole('textbox', { name: /^Outcome/ })).toHaveLength(9);
  expect(outcome(2)).toHaveValue('third');
  expect(screen.getByRole('button', { name: '+ Add outcome' })).toBeEnabled();
});

test('a valid form sends the case and shows what the backend stored', async () => {
  vi.mocked(createCase).mockImplementation(async (input) => stored(input, { title: 'Stored title' }));
  const { user } = setup();
  await openAndFill(user);
  await user.click(submitButton());

  expect(createCase).toHaveBeenCalledWith(expectedInput);
  const card = await screen.findByRole('article', { name: 'Case detail' });
  expect(within(card).getByRole('status')).toHaveTextContent('Case created');
  expect(within(card).getByText('#42')).toBeInTheDocument();
  expect(within(card).getByText('Stored title')).toBeInTheDocument();
  expect(within(within(card).getByRole('list', { name: 'Outcomes' })).getAllByRole('listitem')).toHaveLength(2);
  expect(within(card).getByText('2 minutes (120 seconds)')).toBeInTheDocument();
  expect(within(card).getByText('Random draw')).toBeInTheDocument();
  expect(within(card).getAllByText('Awaiting jurors')).toHaveLength(2);

  // New case is back and opens an empty form.
  await user.click(screen.getByRole('link', { name: /Back to cases/ }));
  await user.click(newCaseButton()!);
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});

test('sends the chosen window, panel size and selection method', async () => {
  vi.mocked(createCase).mockImplementation(async (input) => stored(input));
  const { user } = setup();
  await openAndFill(user);
  const days = screen.getByRole('textbox', { name: 'Days' });
  const hours = screen.getByRole('textbox', { name: 'Hours' });
  const minutes = screen.getByRole('textbox', { name: 'Minutes' });
  await user.clear(days);
  await user.type(days, '1');
  await user.clear(hours);
  await user.type(hours, '12');
  await user.clear(minutes);
  await user.type(minutes, '0');
  await user.click(screen.getByRole('button', { name: /Jurors/ }));
  await user.click(await screen.findByRole('option', { name: '5' }));
  await user.click(screen.getByRole('radio', { name: 'Manual selection' }));
  await user.click(submitButton());

  expect(createCase).toHaveBeenCalledWith({
    ...expectedInput,
    voteWindowSeconds: 129_600,
    panelSize: 5,
    selectionMethod: 'manual',
    refusalWindowSeconds: 86400,
  });
  expect(await screen.findByText('1 day 12 hours (129600 seconds)')).toBeInTheDocument();
});

test('blocks the button while creating, so a double click creates one case', async () => {
  let resolve!: (c: Case) => void;
  vi.mocked(createCase).mockImplementation(() => new Promise((r) => (resolve = r)));
  const { user } = setup();
  await openAndFill(user);
  await user.click(submitButton());
  expect(submitButton()).toBeDisabled();
  expect(submitButton()).toHaveTextContent('Creating…');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.click(submitButton());
  expect(createCase).toHaveBeenCalledTimes(1);
  resolve(stored(expectedInput));
  expect(await screen.findByRole('article', { name: 'Case detail' })).toBeInTheDocument();
});

test('a 422 is shown on the matching field and cleared by editing it', async () => {
  vi.mocked(createCase).mockRejectedValue(
    new ApiError(422, 'POST /cases failed with 422', [
      { type: 'too_small', loc: ['body', 'payload', 'title'], msg: 'Rejected by the server' },
    ]),
  );
  const { user } = setup();
  await openAndFill(user);
  await user.click(submitButton());

  const title = screen.getByRole('textbox', { name: 'Title' });
  expect(await screen.findByText('Rejected by the server')).toBeInTheDocument();
  expect(title).toHaveAttribute('aria-invalid', 'true');
  expect(submitButton()).toBeEnabled();
  await user.type(title, '!');
  expect(screen.queryByText('Rejected by the server')).toBeNull();
});

test('a 403 explains that the permission is gone and keeps the data', async () => {
  vi.mocked(createCase).mockRejectedValue(
    new ApiError(403, 'POST /cases failed with 403', 'Only creators can create cases'),
  );
  const { user } = setup();
  await openAndFill(user);
  await user.click(submitButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('You no longer have permission to create cases.');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Refund dispute');
});

test('a 401 sends the user back to the login', async () => {
  vi.mocked(createCase).mockRejectedValue(new ApiError(401, 'POST /cases failed with 401', 'Unauthorized'));
  const { user, onUnauthorized } = setup();
  await openAndFill(user);
  await user.click(submitButton());
  await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
});

test.each([
  ['a network error', new TypeError('Failed to fetch')],
  ['a 500', new ApiError(500, 'POST /cases failed with 500', 'Internal Server Error')],
])('%s shows a retry message and keeps the data', async (_label, error) => {
  vi.mocked(createCase)
    .mockRejectedValueOnce(error)
    .mockImplementation(async (input) => stored(input));
  const { user } = setup();
  await openAndFill(user);
  await user.click(submitButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the case. Try again.');
  expect(outcome(2)).toHaveValue('No refund');

  await user.click(submitButton());
  expect(await screen.findByRole('article', { name: 'Case detail' })).toBeInTheDocument();
});
