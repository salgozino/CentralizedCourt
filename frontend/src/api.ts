export type User = { id: number; email: string; roles: string[] };
export type ExtraRole = 'creator' | 'juror';

export type SelectionMethod = 'random' | 'manual';
export type CaseStatus = 'awaiting_jurors' | 'voting' | 'resolved';

export type NewCase = {
  title: string;
  description: string;
  outcomes: string[];
  voteWindowSeconds: number;
  panelSize: number;
  selectionMethod: SelectionMethod;
};

export type Case = NewCase & {
  id: number;
  creatorId: number;
  status: CaseStatus;
  result: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DrawnJuror = { userId: number; email: string; drawnAt: string; deadline: string };

/** Body of `POST /api/cases/:id/draw` (200): the case, now `voting`, and the drawn panel in order. */
export type DrawResult = { case: Case; jurors: DrawnJuror[] };

/** One entry of a 422 body: `loc` is e.g. ['body', 'payload', 'outcomes', 1]. */
export type ValidationIssue = { loc: Array<string | number>; msg: string };

export class ApiError extends Error {
  status: number;
  /** The `detail` of the error body, when the response had one. */
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function errorDetail(res: Response): Promise<unknown> {
  try {
    return ((await res.json()) as { detail?: unknown }).detail;
  } catch {
    return undefined;
  }
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.includes(method)) {
    const token = csrfToken();
    if (token) headers.set('X-CSRFToken', token);
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${method} ${path} failed with ${res.status}`, await errorDetail(res));
  return res;
}

export async function requestCode(email: string): Promise<void> {
  await request('POST', '/auth/request-code', { email });
}

export async function verifyCode(email: string, code: string): Promise<User> {
  return (await request('POST', '/auth/verify', { email, code })).json();
}

export async function logout(): Promise<void> {
  await request('POST', '/auth/logout');
}

export async function getMe(): Promise<User | null> {
  try {
    return await (await request('GET', '/me')).json();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function listUsers(): Promise<User[]> {
  return (await request('GET', '/admin/users')).json();
}

export async function setUserRoles(id: number, roles: ExtraRole[]): Promise<User> {
  return (await request('PUT', `/admin/users/${id}/roles`, { roles })).json();
}

export async function listCases(): Promise<Case[]> {
  return (await request('GET', '/cases')).json();
}

export async function getCase(id: string): Promise<Case> {
  return (await request('GET', `/cases/${encodeURIComponent(id)}`)).json();
}

export async function createCase(input: NewCase): Promise<Case> {
  return (await request('POST', '/cases', input)).json();
}

/** Random draw only (manual picker deferred). Errors surface as `ApiError`. */
export async function drawJurors(caseId: number): Promise<DrawResult> {
  throw new Error(`drawJurors(${caseId}) is not implemented`);
}
