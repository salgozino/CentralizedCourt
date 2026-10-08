import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { ApiError, type Case } from './api';

vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  getMe: vi.fn(),
  listUsers: vi.fn().mockResolvedValue([]),
  listCases: vi.fn(),
  getCase: vi.fn(),
  createCase: vi.fn(),
}));
import * as api from './api';

const stored: Case = {
  id: 42,
  creatorId: 2,
  title: 'Refund dispute',
  description: 'Missing parcel.\nTracking says delivered.',
  outcomes: ['Refund', 'No refund'],
  voteWindowSeconds: 120,
  panelSize: 3,
  selectionMethod: 'random',
  status: 'awaiting_jurors',
  result: null,
  createdAt: '2026-10-08T12:00:00Z',
  updatedAt: '2026-10-08T12:00:00Z',
};
const mocks = api as typeof api & { listCases: ReturnType<typeof vi.fn>; getCase: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/cases');
  vi.mocked(api.getMe).mockResolvedValue({ id: 2, email: 'creator1@example.com', roles: ['creator', 'user'] });
  mocks.listCases.mockReset().mockResolvedValue([stored]);
  mocks.getCase.mockReset().mockResolvedValue(stored);
  vi.mocked(api.createCase).mockReset().mockResolvedValue(stored);
});

test('lists cases and navigates to detail and back using real paths', async () => {
  const user = userEvent.setup();
  render(<App />);
  const link = await screen.findByRole('link', { name: /Refund dispute/ });
  expect(link).toHaveAttribute('href', '/cases/42');
  await user.click(link);
  expect(await screen.findByRole('heading', { name: 'Refund dispute' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/cases/42');
  expect(mocks.getCase).toHaveBeenCalledWith('42');
  expect(screen.getByText(stored.description)).toBeInTheDocument();
  for (const text of [
    'Creator ID',
    'Result',
    'Last updated',
    'Random draw',
    '2 minutes (120 seconds)',
    'Not resolved yet',
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /Back to cases/ }));
  expect(await screen.findByRole('link', { name: /Refund dispute/ })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/cases');
  expect(mocks.listCases).toHaveBeenCalledTimes(2);
});

test('shows list loading followed by an empty state', async () => {
  let resolve!: (cases: Case[]) => void;
  mocks.listCases.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<App />);
  expect(await screen.findByText('Loading cases…')).toBeInTheDocument();
  resolve([]);
  expect(await screen.findByRole('heading', { name: 'No cases to show' })).toBeInTheDocument();
});

test.each([new TypeError('Network'), new ApiError(500, 'Server')])('list failures support retry: %s', async (error) => {
  mocks.listCases.mockRejectedValueOnce(error).mockResolvedValueOnce([stored]);
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load cases');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('link', { name: /Refund dispute/ })).toBeInTheDocument();
});

test('a deep-linked detail loads directly and displays a resolved result', async () => {
  window.history.replaceState(null, '', '/cases/42');
  mocks.getCase.mockResolvedValue({ ...stored, status: 'resolved', result: 'Refund' });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Refund dispute' })).toBeInTheDocument();
  expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Refund').length).toBe(2);
  expect(mocks.listCases).not.toHaveBeenCalled();
});

test('detail loading, 404 and retryable errors are distinct', async () => {
  window.history.replaceState(null, '', '/cases/42');
  let reject!: (error: Error) => void;
  mocks.getCase.mockImplementationOnce(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      }),
  );
  render(<App />);
  expect(await screen.findByText('Loading case…')).toBeInTheDocument();
  reject(new ApiError(500, 'Server'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this case');
  mocks.getCase.mockRejectedValueOnce(new ApiError(404, 'Hidden'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Case not found' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
});

test.each(['/cases', '/cases/42'])('401 on %s returns to login', async (path) => {
  window.history.replaceState(null, '', path);
  mocks.listCases.mockRejectedValue(new ApiError(401, 'Unauthorized'));
  mocks.getCase.mockRejectedValue(new ApiError(401, 'Unauthorized'));
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Send code' })).toBeInTheDocument();
});

test('plain users can browse but cannot create, including through a deep link', async () => {
  vi.mocked(api.getMe).mockResolvedValue({ id: 8, email: 'user@example.com', roles: ['user'] });
  mocks.listCases.mockResolvedValue([]);
  render(<App />);
  expect(await screen.findByRole('button', { name: 'New case' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'New case' })).toHaveAccessibleDescription(
    'Only creators and admins can create cases.',
  );
});

test('creation redirects to detail and returning refreshes the list', async () => {
  mocks.listCases.mockResolvedValueOnce([]).mockResolvedValue([stored]);
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'New case' }));
  expect(window.location.pathname).toBe('/cases/new');
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Refund dispute');
  await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Missing parcel.');
  await user.type(screen.getByRole('textbox', { name: 'Outcome 1' }), 'Refund');
  await user.type(screen.getByRole('textbox', { name: 'Outcome 2' }), 'No refund');
  await user.click(screen.getByRole('button', { name: 'Create case' }));
  expect(await screen.findByRole('heading', { name: 'Refund dispute' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/cases/42');
  expect(screen.getByRole('status')).toHaveTextContent('Case created');
  await user.click(screen.getByRole('link', { name: /Back to cases/ }));
  expect(await screen.findByRole('link', { name: /Refund dispute/ })).toBeInTheDocument();
});

test('admin Home retains users management and Cases is a separate page', async () => {
  window.history.replaceState(null, '', '/');
  vi.mocked(api.getMe).mockResolvedValue({ id: 1, email: 'admin@example.com', roles: ['admin', 'user'] });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
  await userEvent.setup().click(screen.getByRole('link', { name: 'Cases' }));
  expect(await screen.findByRole('button', { name: 'New case' })).toBeEnabled();
  expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
  await waitFor(() => expect(window.location.pathname).toBe('/cases'));
});
