import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, castVote, createCase, drawJurors, getCase, getMe, listCases, setUserRoles, verifyCode } from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'csrftoken=abc123';
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('PUT sends X-CSRFToken from the cookie', async () => {
  const user = { id: 2, email: 'a@b.c', roles: ['creator', 'user'] };
  fetchMock.mockResolvedValue(json(200, user));
  await expect(setUserRoles(2, ['creator'])).resolves.toEqual(user);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/admin/users/2/roles');
  expect(init.method).toBe('PUT');
  expect(init.credentials).toBe('same-origin');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc123');
  expect(init.body).toBe(JSON.stringify({ roles: ['creator'] }));
});

test('POST sends X-CSRFToken from the cookie', async () => {
  fetchMock.mockResolvedValue(json(200, { id: 1, email: 'a@b.c', roles: ['user'] }));
  await verifyCode('a@b.c', '123456');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/auth/verify');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc123');
});

test.each([
  ['/api/cases', () => listCases(), []],
  ['/api/cases/42', () => getCase('42'), { id: 42 }],
] as const)('case read uses authenticated GET without CSRF: %s', async (path, call, body) => {
  fetchMock.mockResolvedValue(json(200, body));
  await expect(call()).resolves.toEqual(body);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(path);
  expect(init.method).toBe('GET');
  expect(init.credentials).toBe('same-origin');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBeNull();
});

test('GET does not send X-CSRFToken', async () => {
  fetchMock.mockResolvedValue(json(200, { id: 1, email: 'a@b.c', roles: ['user'] }));
  await getMe();
  const [, init] = fetchMock.mock.calls[0];
  expect(new Headers(init.headers).get('X-CSRFToken')).toBeNull();
});

test('getMe returns null on 401', async () => {
  fetchMock.mockResolvedValue(json(401, { detail: 'Unauthorized' }));
  await expect(getMe()).resolves.toBeNull();
});

test('non-2xx throws ApiError with status', async () => {
  fetchMock.mockResolvedValue(json(401, { detail: 'nope' }));
  const err = await verifyCode('a@b.c', '000000').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(401);
});

test('ApiError carries the detail of the error body', async () => {
  const detail = [{ loc: ['body', 'payload', 'title'], msg: 'Too small' }];
  fetchMock.mockResolvedValue(json(422, { detail }));
  const err = await verifyCode('a@b.c', '000000').catch((e) => e);
  expect(err.detail).toEqual(detail);
});

test('ApiError tolerates a non-JSON error body', async () => {
  fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
  const err = await verifyCode('a@b.c', '000000').catch((e) => e);
  expect(err).toMatchObject({ status: 502, detail: undefined });
});

test('createCase POSTs the case with CSRF and returns the created case', async () => {
  const input = {
    title: 'T',
    description: 'D',
    outcomes: ['A', 'B'],
    voteWindowSeconds: 120,
    panelSize: 3,
    selectionMethod: 'random' as const,
  };
  const created = { ...input, id: 7, creatorId: 2, status: 'awaiting_jurors', result: null };
  fetchMock.mockResolvedValue(json(201, created));
  await expect(createCase(input)).resolves.toEqual(created);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/cases');
  expect(init.method).toBe('POST');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc123');
  expect(JSON.parse(init.body)).toEqual(input);
});

test('drawJurors POSTs to the draw endpoint with CSRF and no body', async () => {
  fetchMock.mockResolvedValue(json(200, { case: { id: 7 }, jurors: [] }));
  await drawJurors(7);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/cases/7/draw');
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('same-origin');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc123');
  expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  expect(init.body).toBeUndefined();
});

test('drawJurors returns the case and the drawn jurors', async () => {
  const result = {
    case: { id: 7, creatorId: 2, status: 'voting', result: null },
    jurors: [
      { jurorId: 3, name: 'Juror 1', drawnAt: '2026-10-08T10:00:00.000Z', deadline: '2026-10-08T10:02:00.000Z' },
      { jurorId: 5, name: 'Juror 2', drawnAt: '2026-10-08T10:00:00.000Z', deadline: '2026-10-08T10:02:00.000Z' },
    ],
  };
  fetchMock.mockResolvedValue(json(200, result));
  await expect(drawJurors(7)).resolves.toEqual(result);
});

test('castVote POSTs the outcome index with CSRF and returns the updated case', async () => {
  const detail = { id: 7, status: 'voting', jurors: [{ jurorId: 5, hasVoted: true, outcomeIndex: 1 }] };
  fetchMock.mockResolvedValue(json(200, detail));
  await expect(castVote(7, 1)).resolves.toEqual(detail);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/cases/7/vote');
  expect(init.method).toBe('POST');
  expect(new Headers(init.headers).get('X-CSRFToken')).toBe('abc123');
  expect(JSON.parse(init.body)).toEqual({ outcomeIndex: 1 });
});

test('castVote rejects with ApiError carrying the detail', async () => {
  fetchMock.mockResolvedValue(json(409, { detail: 'You have already voted' }));
  const err = await castVote(7, 0).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 409, detail: 'You have already voted' });
});

test.each([
  [403, 'Only the case creator or an admin can draw jurors'],
  [404, 'Case not found'],
  [409, 'Not enough eligible jurors: 1 available, 3 required'],
  [422, [{ loc: ['params', 'id'], msg: 'Expected number' }]],
] as const)('drawJurors rejects with ApiError on %i carrying the detail', async (status, detail) => {
  fetchMock.mockResolvedValue(json(status, { detail }));
  const err = await drawJurors(7).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status, detail });
});
