import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import HomePage from './HomePage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  listUsers: vi.fn().mockResolvedValue([]),
  setUserRoles: vi.fn(),
  logout: vi.fn(),
  createCase: vi.fn(),
}));
import { ApiError, createCase, logout } from '../api';

beforeEach(() => {
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});

const renderHome = (roles: string[], onLogout = vi.fn()) =>
  render(<HomePage user={{ id: 1, email: 'me@example.com', roles }} onLogout={onLogout} onUserChange={vi.fn()} />);

const heading = (name: string) => screen.queryByRole('heading', { name });
const newCase = () => screen.getByRole('button', { name: 'New case' });
const NO_PERMS = 'You have no permissions yet. Ask an admin to assign you a role.';

test('admin sees the users section', async () => {
  renderHome(['admin', 'user']);
  expect(screen.getByText('me@example.com')).toBeInTheDocument();
  expect(heading('Users')).toBeInTheDocument();
  expect(heading('Cases')).toBeInTheDocument();
  expect(newCase()).toBeEnabled();
  expect(heading('My assignments')).toBeNull();
  expect(screen.queryByText(NO_PERMS)).toBeNull();
  expect(await screen.findByRole('table')).toBeInTheDocument();
});

test('creator sees Cases and can create', () => {
  renderHome(['creator', 'user']);
  expect(heading('Cases')).toBeInTheDocument();
  expect(newCase()).toBeEnabled();
  expect(heading('My assignments')).toBeNull();
  expect(heading('Users')).toBeNull();
});

test('juror sees My assignments and Cases, but cannot create', () => {
  renderHome(['juror', 'user']);
  expect(heading('My assignments')).toBeInTheDocument();
  expect(screen.getByText('Assignments will be available in slice 3.')).toBeInTheDocument();
  expect(heading('Cases')).toBeInTheDocument();
  expect(newCase()).toBeDisabled();
});

test('creator + juror sees both', () => {
  renderHome(['creator', 'juror', 'user']);
  expect(heading('Cases')).toBeInTheDocument();
  expect(heading('My assignments')).toBeInTheDocument();
});

test('plain user sees the no-permissions message', () => {
  renderHome(['user']);
  expect(screen.getByText(NO_PERMS)).toBeInTheDocument();
  expect(heading('Cases')).toBeInTheDocument();
  expect(newCase()).toBeDisabled();
});

test('logout calls the api then onLogout', async () => {
  const onLogout = vi.fn();
  renderHome(['user'], onLogout);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }));
  expect(logout).toHaveBeenCalled();
  expect(onLogout).toHaveBeenCalled();
});

test('a 401 while creating a case returns to the login without calling logout', async () => {
  vi.mocked(createCase).mockRejectedValue(new ApiError(401, 'POST /cases failed with 401'));
  const onLogout = vi.fn();
  renderHome(['creator', 'user'], onLogout);
  const user = userEvent.setup();
  await user.click(newCase());
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Refund dispute');
  await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Missing parcel');
  await user.type(screen.getByRole('textbox', { name: 'Outcome 1' }), 'Yes');
  await user.type(screen.getByRole('textbox', { name: 'Outcome 2' }), 'No');
  await user.click(screen.getByRole('button', { name: 'Create case' }));
  await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  expect(logout).not.toHaveBeenCalled();
});
