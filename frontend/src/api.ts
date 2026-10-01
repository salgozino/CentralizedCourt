export type User = { id: number; email: string; roles: string[] };
export type ExtraRole = "creator" | "juror";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (!SAFE_METHODS.includes(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRFToken", token);
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${method} ${path} failed with ${res.status}`);
  return res;
}

export async function requestCode(email: string): Promise<void> {
  await request("POST", "/auth/request-code", { email });
}

export async function verifyCode(email: string, code: string): Promise<User> {
  return (await request("POST", "/auth/verify", { email, code })).json();
}

export async function logout(): Promise<void> {
  await request("POST", "/auth/logout");
}

export async function getMe(): Promise<User | null> {
  try {
    return await (await request("GET", "/me")).json();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function listUsers(): Promise<User[]> {
  return (await request("GET", "/admin/users")).json();
}

export async function setUserRoles(id: number, roles: ExtraRole[]): Promise<User> {
  return (await request("PUT", `/admin/users/${id}/roles`, { roles })).json();
}
