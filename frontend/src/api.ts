export type Role = 'user' | 'admin' | 'creator' | 'juror';
export type Profile = { id: number; email: string; roles: Role[] };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    // Read again on every request: Django rotates this cookie at login.
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('csrftoken='));
    if (csrf) headers['X-CSRFToken'] = decodeURIComponent(csrf.slice('csrftoken='.length));
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = response.status === 401 ? 'Your session or code is invalid or expired. Please sign in again.'
      : response.status === 403 ? 'Permission denied. Refresh the page and check your permissions.'
      : 'The request failed. Please try again.';
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}
