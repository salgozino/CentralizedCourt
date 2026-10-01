import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  getMe: vi.fn(),
  listUsers: vi.fn().mockResolvedValue([]),
}));
import { getMe } from "./api";

beforeEach(() => {
  vi.mocked(getMe).mockReset();
});

test("shows login when not authenticated", async () => {
  vi.mocked(getMe).mockResolvedValue(null);
  render(<App />);
  expect(screen.getByText("Loading...")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Send code" })).toBeInTheDocument();
});

test("shows home when authenticated", async () => {
  vi.mocked(getMe).mockResolvedValue({ id: 1, email: "u@example.com", roles: ["creator", "user"] });
  render(<App />);
  expect(await screen.findByText("u@example.com")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Cases" })).toBeInTheDocument();
});
