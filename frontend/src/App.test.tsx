import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import type { Role, User } from "./api";

/** In-memory stand-in for the backend contract in slice1.md. */
function fakeBackend() {
  const users: User[] = [
    { id: 1, email: "admin@example.com", roles: ["admin", "user"] },
    { id: 2, email: "creator1@example.com", roles: ["creator", "user"] },
    { id: 3, email: "juror1@example.com", roles: ["juror", "user"] },
    { id: 4, email: "user@example.com", roles: ["user"] },
  ];
  const codes = new Map<string, string>();
  let session: number | null = null;
  const requests: { method: string; path: string; body: unknown }[] = [];

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function handle(url: string, init: RequestInit = {}) {
    const method = init.method ?? "GET";
    const path = url.replace(/^\/api/, "");
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method, path, body });
    const me = users.find((u) => u.id === session);

    if (path === "/auth/csrf") return json(200, { detail: "ok" });
    if (path === "/auth/request-code") {
      if (users.some((u) => u.email === body.email)) codes.set(body.email, "123456");
      return json(200, { detail: "sent" });
    }
    if (path === "/auth/verify") {
      const user = users.find((u) => u.email === body.email);
      if (!user || codes.get(body.email) !== body.code) return json(401, { detail: "Invalid" });
      codes.delete(body.email);
      session = user.id;
      return json(200, user);
    }
    if (path === "/auth/logout") {
      session = null;
      return json(200, { detail: "Logged out" });
    }
    if (!me) return json(401, { detail: "Unauthorized" });
    if (path === "/me") return json(200, me);
    if (!me.roles.includes("admin")) return json(403, { detail: "Admin role required" });
    if (path === "/admin/users") return json(200, users);
    const match = path.match(/^\/admin\/users\/(\d+)\/roles$/);
    if (match && method === "PUT") {
      const user = users.find((u) => u.id === Number(match[1]));
      if (!user) return json(404, { detail: "Not found" });
      const roles: Role[] = ["user", ...(body.roles as Role[])];
      if (user.roles.includes("admin")) roles.push("admin");
      user.roles = [...new Set(roles)].sort();
      return json(200, user);
    }
    return json(404, { detail: "Not found" });
  }

  return { handle, requests };
}

let backend: ReturnType<typeof fakeBackend>;

beforeEach(() => {
  backend = fakeBackend();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => backend.handle(url, init)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function logIn(email: string, code = "123456") {
  const user = userEvent.setup();
  render(<App />);
  await user.type(await screen.findByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send login code" }));
  await user.type(await screen.findByLabelText("Login code"), code);
  await user.click(screen.getByRole("button", { name: "Log in" }));
  return user;
}

const section = (name: string) => screen.queryByRole("region", { name });

describe("login", () => {
  test("logs in with email and code and shows email and roles", async () => {
    await logIn("creator1@example.com");
    expect(await screen.findByTestId("current-email")).toHaveProperty(
      "textContent",
      "creator1@example.com",
    );
    const roles = screen.getByLabelText("Your roles");
    expect(within(roles).getByText("creator")).toBeTruthy();
    expect(within(roles).getByText("user")).toBeTruthy();
    expect(backend.requests.find((r) => r.path === "/auth/verify")?.body).toEqual({
      email: "creator1@example.com",
      code: "123456",
    });
  });

  test("shows an error for a wrong code and stays on the login screen", async () => {
    await logIn("user@example.com", "000000");
    expect(await screen.findByText("Invalid or expired code.")).toBeTruthy();
    expect(screen.getByLabelText("Login code")).toBeTruthy();
  });

  test("restores an existing session on load", async () => {
    await backend.handle("/api/auth/request-code", {
      method: "POST",
      body: JSON.stringify({ email: "juror1@example.com" }),
    });
    await backend.handle("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email: "juror1@example.com", code: "123456" }),
    });
    render(<App />);
    expect(await screen.findByText("juror1@example.com")).toBeTruthy();
  });

  test("logout returns to the login screen", async () => {
    const user = await logIn("user@example.com");
    await user.click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(backend.requests.some((r) => r.path === "/auth/logout")).toBe(true);
  });
});

describe("sections per role", () => {
  test("admin sees the users section only", async () => {
    await logIn("admin@example.com");
    expect(await screen.findByRole("region", { name: "Users" })).toBeTruthy();
    expect(section("Cases")).toBeNull();
    expect(section("My assignments")).toBeNull();
    expect(screen.queryByText("No permissions yet")).toBeNull();
  });

  test("creator sees the cases placeholder", async () => {
    await logIn("creator1@example.com");
    expect(await screen.findByRole("region", { name: "Cases" })).toBeTruthy();
    expect(section("Users")).toBeNull();
    expect(section("My assignments")).toBeNull();
  });

  test("juror sees the assignments placeholder", async () => {
    await logIn("juror1@example.com");
    expect(await screen.findByRole("region", { name: "My assignments" })).toBeTruthy();
    expect(section("Users")).toBeNull();
    expect(section("Cases")).toBeNull();
  });

  test("plain user sees a no-permissions message", async () => {
    await logIn("user@example.com");
    expect(await screen.findByText("No permissions yet")).toBeTruthy();
    expect(section("Users")).toBeNull();
    expect(section("Cases")).toBeNull();
    expect(section("My assignments")).toBeNull();
  });
});

describe("admin role management", () => {
  test("admin grants creator and juror to user@example.com", async () => {
    const user = await logIn("admin@example.com");
    await user.click(await screen.findByLabelText("creator for user@example.com"));
    await waitFor(() =>
      expect(screen.getByTestId("roles-user@example.com").textContent).toBe("creator, user"),
    );
    await user.click(screen.getByLabelText("juror for user@example.com"));
    await waitFor(() =>
      expect(screen.getByTestId("roles-user@example.com").textContent).toBe(
        "creator, juror, user",
      ),
    );
    const puts = backend.requests.filter((r) => r.method === "PUT");
    expect(puts.map((r) => r.body)).toEqual([
      { roles: ["creator"] },
      { roles: ["creator", "juror"] },
    ]);

    // The promoted user now sees both sections.
    await user.click(screen.getByRole("button", { name: "Log out" }));
    cleanup();
    await logIn("user@example.com");
    expect(await screen.findByRole("region", { name: "Cases" })).toBeTruthy();
    expect(section("My assignments")).toBeTruthy();
    expect(screen.queryByText("No permissions yet")).toBeNull();
  });

  test("admin removes a role", async () => {
    const user = await logIn("admin@example.com");
    await user.click(await screen.findByLabelText("juror for juror1@example.com"));
    await waitFor(() =>
      expect(screen.getByTestId("roles-juror1@example.com").textContent).toBe("user"),
    );
    expect(backend.requests.at(-1)).toMatchObject({
      method: "PUT",
      path: "/admin/users/3/roles",
      body: { roles: [] },
    });
  });

  test("admin granting themselves a role updates their own sections", async () => {
    const user = await logIn("admin@example.com");
    await user.click(await screen.findByLabelText("creator for admin@example.com"));
    expect(await screen.findByRole("region", { name: "Cases" })).toBeTruthy();
  });
});
