import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import AdminUsersSection from './AdminUsersSection';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  listUsers: vi.fn(),
  setUserRoles: vi.fn(),
}));
import { listUsers, setUserRoles } from '../api';

const users = [
  { id: 1, email: 'admin@example.com', roles: ['admin', 'user'] },
  { id: 2, email: 'user@example.com', roles: ['user'] },
];

beforeEach(() => {
  vi.mocked(listUsers).mockReset().mockResolvedValue(users);
  vi.mocked(setUserRoles).mockReset();
});

test('lists users and toggling creator updates the row', async () => {
  vi.mocked(setUserRoles).mockResolvedValue({
    id: 2,
    email: 'user@example.com',
    roles: ['creator', 'user'],
  });
  const user = userEvent.setup();
  render(<AdminUsersSection currentUserId={1} onSelfChange={vi.fn()} />);

  const row = (await screen.findByText('user@example.com')).closest('tr')!;
  expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  await user.click(within(row).getByRole('checkbox', { name: /creator/i }));

  expect(setUserRoles).toHaveBeenCalledWith(2, ['creator']);
  expect(await within(row).findByText('creator, user')).toBeInTheDocument();
  expect(within(row).getByRole('checkbox', { name: /creator/i })).toBeChecked();
});

test('editing own roles calls onSelfChange', async () => {
  const updated = { id: 1, email: 'admin@example.com', roles: ['admin', 'juror', 'user'] };
  vi.mocked(setUserRoles).mockResolvedValue(updated);
  const onSelfChange = vi.fn();
  const user = userEvent.setup();
  render(<AdminUsersSection currentUserId={1} onSelfChange={onSelfChange} />);

  const row = (await screen.findByText('admin@example.com')).closest('tr')!;
  await user.click(within(row).getByRole('checkbox', { name: /juror/i }));
  expect(onSelfChange).toHaveBeenCalledWith(updated);
});

test('shows an error when saving fails', async () => {
  vi.mocked(setUserRoles).mockRejectedValue(new Error('boom'));
  const user = userEvent.setup();
  render(<AdminUsersSection currentUserId={1} onSelfChange={vi.fn()} />);
  const row = (await screen.findByText('user@example.com')).closest('tr')!;
  await user.click(within(row).getByRole('checkbox', { name: /creator/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update roles');
});
