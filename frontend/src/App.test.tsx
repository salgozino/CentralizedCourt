// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import type { Profile } from './api';

const profile = (email: string, roles: Profile['roles'], id = 1): Profile => ({ id, email, roles });
let current: Profile | null;
let users: Profile[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  current = null;
  users = [profile('admin@example.com', ['admin', 'user']), profile('user@example.com', ['user'], 2)];
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    let status = 200;
    let data: unknown = {};
    const body = options?.body ? JSON.parse(options.body as string) : {};
    if (url === '/api/me') {
      status = current ? 200 : 401;
      data = current;
    } else if (url === '/api/auth/verify') {
      if (body.code === '123456') {
        current = profile(body.email, ['user']); data = current;
      } else status = 401;
    } else if (url === '/api/auth/logout') current = null;
    else if (url === '/api/admin/users') data = users;
    else if (url.includes('/roles')) {
      const id = Number(url.split('/')[4]);
      const user = users.find((u) => u.id === id)!;
      user.roles = [...body.roles, ...(user.roles.includes('admin') ? ['admin'] : []), 'user'].sort();
      data = { ...user };
    }
    return { ok: status === 200, status, json: async () => data };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requests a code, rejects a wrong one, logs in and logs out', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in' });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }));
  await screen.findByLabelText('6-digit code');
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/request-code', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'user@example.com' }),
  }));
  fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
  expect((await screen.findByRole('alert')).textContent).toContain('invalid or expired');
  fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
  await screen.findByRole('heading', { name: 'No permissions yet' });
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
  await screen.findByRole('heading', { name: 'Sign in' });
});

const seeded: Array<[string, Profile['roles']]> = [
  ['admin@example.com', ['admin', 'user']],
  ...[1, 2].map((i): [string, Profile['roles']] => [`creator${i}@example.com`, ['creator', 'user']]),
  ...[1, 2, 3, 4, 5].map((i): [string, Profile['roles']] => [`juror${i}@example.com`, ['juror', 'user']]),
  ['user@example.com', ['user']],
  ['multi@example.com', ['admin', 'creator', 'juror', 'user']],
];

describe.each(seeded)('%s', (email, roles) => {
  it('restores the session and shows exactly the sections for its roles', async () => {
    current = profile(email, roles);
    render(<App />);
    await screen.findByRole('heading', { name: email });
    expect(!!screen.queryByRole('heading', { name: 'Cases' })).toBe(roles.includes('creator'));
    expect(!!screen.queryByRole('heading', { name: 'My assignments' })).toBe(roles.includes('juror'));
    expect(!!screen.queryByRole('heading', { name: 'User administration' })).toBe(roles.includes('admin'));
    expect(!!screen.queryByRole('heading', { name: 'No permissions yet' })).toBe(roles.length === 1);
    if (roles.includes('admin')) await screen.findByRole('form', { name: 'Roles for user@example.com' });
  });
});

it('admin assigns and removes creator/juror without exposing admin controls', async () => {
  current = users[0];
  render(<App />);
  const row = within(await screen.findByRole('form', { name: 'Roles for user@example.com' }));
  expect(row.queryByRole('checkbox', { name: 'Admin' })).toBeNull();
  fireEvent.click(row.getByRole('checkbox', { name: 'Creator' }));
  fireEvent.click(row.getByRole('checkbox', { name: 'Juror' }));
  fireEvent.click(row.getByRole('button', { name: 'Save roles' }));
  await waitFor(() => expect(row.getByText('creator, juror, user')).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/2/roles', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ roles: ['creator', 'juror'] }),
  }));
  fireEvent.click(row.getByRole('checkbox', { name: 'Creator' }));
  fireEvent.click(row.getByRole('checkbox', { name: 'Juror' }));
  fireEvent.click(row.getByRole('button', { name: 'Save roles' }));
  await waitFor(() => expect(row.getByText('user')).toBeTruthy());
});

it('refreshes an existing plain-user session after an admin grants both roles', async () => {
  current = users[1];
  render(<App />);
  await screen.findByRole('heading', { name: 'No permissions yet' });
  current = { ...current, roles: ['creator', 'juror', 'user'] };
  fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }));
  await screen.findByRole('heading', { name: 'Cases' });
  expect(screen.getByRole('heading', { name: 'My assignments' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'No permissions yet' })).toBeNull();
});

it('shows network errors instead of silently treating them as logged out', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Network unavailable'));
  render(<App />);
  expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable');
});
