import * as fs from 'node:fs';

import { test as base, expect, type Page } from '@playwright/test';

const LINE_RE = /^LOGIN CODE (\S+) (\d{6})$/gm;

function backendStdout(): string {
  return fs.readFileSync(process.env.E2E_STDOUT_FILE!, 'utf8');
}

/** Latest login code the backend printed for `email` after `mark` (a stdout length). */
function codeSince(email: string, mark: number): string | null {
  let latest: string | null = null;
  for (const match of backendStdout().slice(mark).matchAll(LINE_RE)) {
    if (match[1] === email) latest = match[2];
  }
  return latest;
}

/** Logs in through the login page, reading the emailed code from the backend stdout. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  const mark = backendStdout().length;
  await page.getByRole('button', { name: 'Send code' }).click();
  let code: string | null = null;
  await expect.poll(() => (code = codeSince(email, mark)), { message: `login code for ${email}` }).not.toBeNull();
  await page.getByLabel('Code').fill(code!);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(email)).toBeVisible();
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern for fixture deps.
  baseURL: async ({}, use) => use(process.env.E2E_BASE_URL),
});

export { expect };
