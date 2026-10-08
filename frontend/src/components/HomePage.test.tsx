import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import HomePage from './HomePage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  listUsers: vi.fn().mockResolvedValue([]),
  logout: vi.fn(),
}));
import { logout } from '../api';

beforeEach(() => {
  vi.mocked(logout).mockReset().mockResolvedValue(undefined);
});
const renderHome = (roles: string[], onLogout = vi.fn()) =>
  render(
    <MemoryRouter>
      <HomePage user={{ id: 1, email: 'me@example.com', roles }} onLogout={onLogout} onUserChange={vi.fn()} />
    </MemoryRouter>,
  );

test('admin retains users management, with cases removed from Home', async () => {
  renderHome(['admin', 'user']);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Cases' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
});

test.each([['creator', 'user'], ['juror', 'user'], ['creator', 'juror', 'user'], ['user']])(
  'Home does not contain cases for roles %s',
  (...roles) => {
    renderHome(roles);
    expect(screen.queryByRole('heading', { name: 'Cases' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New case' })).toBeNull();
    if (roles.includes('juror')) expect(screen.getByRole('heading', { name: 'My assignments' })).toBeInTheDocument();
    if (roles.length === 1)
      expect(screen.getByText('You have no permissions yet. Ask an admin to assign you a role.')).toBeInTheDocument();
  },
);

test('logout calls the API then onLogout', async () => {
  const onLogout = vi.fn();
  renderHome(['user'], onLogout);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }));
  expect(logout).toHaveBeenCalled();
  expect(onLogout).toHaveBeenCalled();
});
