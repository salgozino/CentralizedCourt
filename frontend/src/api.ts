export type Role = "user" | "admin" | "creator" | "juror";
export type AssignableRole = "creator" | "juror";

export interface User {
  id: number;
  email: string;
  roles: Role[];
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-CSRFToken": csrfToken() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : response.statusText;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}

export const api = {
  csrf: () => request<unknown>("GET", "/auth/csrf"),
  requestCode: (email: string) => request<unknown>("POST", "/auth/request-code", { email }),
  verify: (email: string, code: string) =>
    request<User>("POST", "/auth/verify", { email, code }),
  logout: () => request<unknown>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/me"),
  listUsers: () => request<User[]>("GET", "/admin/users"),
  setRoles: (userId: number, roles: AssignableRole[]) =>
    request<User>("PUT", `/admin/users/${userId}/roles`, { roles }),
};
