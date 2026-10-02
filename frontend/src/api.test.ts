// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

it('uses relative API paths, session cookies and the current CSRF cookie for mutations', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrftoken=first; path=/';
  await api('/auth/verify', 'POST', { email: 'user@example.com', code: '123456' });
  expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/verify', expect.objectContaining({
    credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': 'first' },
  }));
  document.cookie = 'csrftoken=rotated; path=/';
  await api('/auth/logout', 'POST');
  expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/logout', expect.objectContaining({
    headers: { 'X-CSRFToken': 'rotated' },
  }));
});

it('preserves HTTP error status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(api('/admin/users')).rejects.toBeInstanceOf(ApiError);
  await expect(api('/admin/users')).rejects.toMatchObject({ status: 403 });
});
