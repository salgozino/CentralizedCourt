export type User = { id: number; email: string; roles: string[] };
export type ExtraRole = 'creator' | 'juror';

export type SelectionMethod = 'random' | 'manual';
export type CaseStatus = 'awaiting_jurors' | 'refusal' | 'voting' | 'resolved';

export type NewCase = {
  title: string;
  description: string;
  outcomes: string[];
  voteWindowSeconds: number;
  refusalWindowSeconds?: number | null;
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

/**
 * A seated juror as the backend returns it: `jurorId` is the user's id; no email is exposed. `outcomeIndex` is the
 * juror's choice: everyone sees it once the case is resolved, before that only the juror sees their own.
 */
export type DrawnJuror = {
  jurorId: number;
  name: string;
  drawnAt: string;
  deadline: string;
  hasVoted: boolean;
  outcomeIndex: number | null;
};

/** Body of `GET /api/cases/:id`: the case plus its seated panel in draw order (empty before the draw). */
export type Assignment = {
  id: number;
  position: number;
  jurorId: number;
  name: string;
  selectedById: number | null;
  selectedByName: string | null;
  predecessorId: number | null;
  drawnAt: string;
  refusalDeadline: string | null;
  refusedAt: string | null;
};
export type CaseDetail = Case & { jurors: DrawnJuror[]; assignmentHistory?: Assignment[] };

/** A juror who can be picked for a manual panel (`GET /api/cases/:id/eligible-jurors`): no email. */
export type EligibleJuror = { jurorId: number; name: string };

/** Body of `POST /api/cases/:id/draw` (200): the case, now `voting`, and the drawn panel in order. */
export type DrawResult = { case: CaseDetail; jurors: DrawnJuror[] };

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

export async function getCase(id: string): Promise<CaseDetail> {
  return (await request('GET', `/cases/${encodeURIComponent(id)}`)).json();
}

export async function createCase(input: NewCase): Promise<Case> {
  return (await request('POST', '/cases', input)).json();
}

/** A final vote by the signed-in panel juror; answers the updated case (possibly resolved). */
export async function castVote(caseId: number, outcomeIndex: number): Promise<CaseDetail> {
  return (await request('POST', `/cases/${caseId}/vote`, { outcomeIndex })).json();
}

/** Random draw without `jurorIds`; a manual draw sends the picked ids in panel order. Errors surface as `ApiError`. */
export async function drawJurors(caseId: number, jurorIds?: number[]): Promise<DrawResult> {
  return (await request('POST', `/cases/${caseId}/draw`, jurorIds && { jurorIds })).json();
}

/** The pool a manual panel is picked from; only the case creator or an admin may read it. */
export async function listEligibleJurors(caseId: number): Promise<EligibleJuror[]> {
  return (await request('GET', `/cases/${caseId}/eligible-jurors`)).json();
}

export async function refuseAssignment(caseId: number): Promise<void> {
  await request('POST', `/cases/${caseId}/refuse`, {});
}
export async function replaceJuror(caseId: number, position: number, jurorId: number): Promise<CaseDetail> {
  return (await request('POST', `/cases/${caseId}/replace`, { position, jurorId })).json();
}
