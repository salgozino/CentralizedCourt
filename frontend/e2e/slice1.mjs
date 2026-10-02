// Real browser + Vite proxy + Django. Uses an isolated temporary SQLite database.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'court-slice1-'));
const env = { ...process.env, DJANGO_DB_PATH: join(temporary, 'test.sqlite3') };
const servers = [];
let backendLog = '';
let browser;
const origin = 'http://localhost:5173';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await pause(100);
  }
  throw new Error(`Server did not start: ${url}`);
}

async function login(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).fill(email);
  const previousLength = backendLog.length;
  await page.getByRole('button', { name: 'Request code', exact: true }).click();
  await page.getByLabel('6-digit code').waitFor();
  const pattern = new RegExp(`LOGIN CODE ${email.replaceAll('.', '\\.')} (\\d{6})`);
  let code;
  for (let attempt = 0; attempt < 50; attempt++) {
    code = backendLog.slice(previousLength).match(pattern)?.[1];
    if (code) break;
    await pause(100);
  }
  assert.ok(code, `No console code for ${email}`);
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await page.getByRole('heading', { name: email, exact: true }).waitFor();
}

try {
  for (const url of [origin, 'http://localhost:8000/api/openapi.json']) {
    const alreadyRunning = await fetch(url).then(() => true, () => false);
    assert.equal(alreadyRunning, false, `Stop the existing server first: ${url}`);
  }
  execFileSync('make', ['migrate', 'seed'], { cwd: root, env, stdio: 'pipe' });
  for (const target of ['dev-backend', 'dev-frontend']) {
    const process = spawn('make', [target], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    servers.push(process);
    process.stdout.on('data', (chunk) => { if (target === 'dev-backend') backendLog += chunk; });
    process.stderr.on('data', (chunk) => { if (target === 'dev-backend') backendLog += chunk; });
  }
  await waitForServer(`${origin}/api/openapi.json`);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const errors = [];
  const seed = [
    ['admin@example.com', ['admin']],
    ...[1, 2].map((i) => [`creator${i}@example.com`, ['creator']]),
    ...[1, 2, 3, 4, 5].map((i) => [`juror${i}@example.com`, ['juror']]),
    ['user@example.com', []],
  ];
  for (const [email, roles] of seed) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, email);
    for (const [role, title] of [['admin', 'User administration'], ['creator', 'Cases'], ['juror', 'My assignments']]) {
      assert.equal(await page.getByRole('heading', { name: title, exact: true }).count(), roles.includes(role) ? 1 : 0);
    }
    if (roles.length === 0) await page.getByRole('heading', { name: 'No permissions yet' }).waitFor();
    if (!roles.includes('admin')) {
      assert.equal((await context.request.get(`${origin}/api/admin/users`)).status(), 403);
    }
    await page.reload();
    await page.getByRole('heading', { name: email, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
    assert.equal((await context.request.get(`${origin}/api/me`)).status(), 401);
    await context.close();
    console.log(`PASS console login / role sections / reload / logout: ${email}`);
  }

  const adminContext = await browser.newContext();
  const userContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const user = await userContext.newPage();
  await login(admin, 'admin@example.com');
  await login(user, 'user@example.com');
  const row = admin.getByRole('form', { name: 'Roles for user@example.com', exact: true });
  await row.getByRole('checkbox', { name: 'Creator', exact: true }).check();
  await row.getByRole('checkbox', { name: 'Juror', exact: true }).check();
  await row.getByRole('button', { name: 'Save roles', exact: true }).click();
  await row.getByText('creator, juror, user', { exact: true }).waitFor();
  const me = await (await userContext.request.get(`${origin}/api/me`)).json();
  assert.deepEqual(me.roles, ['creator', 'juror', 'user']);
  await user.getByRole('button', { name: 'Refresh profile', exact: true }).click();
  await user.getByRole('heading', { name: 'Cases', exact: true }).waitFor();
  await user.getByRole('heading', { name: 'My assignments', exact: true }).waitFor();
  await row.getByRole('checkbox', { name: 'Creator', exact: true }).uncheck();
  await row.getByRole('checkbox', { name: 'Juror', exact: true }).uncheck();
  await row.getByRole('button', { name: 'Save roles', exact: true }).click();
  await row.getByText('user', { exact: true }).waitFor();
  await user.getByRole('button', { name: 'Refresh profile', exact: true }).click();
  await user.getByRole('heading', { name: 'No permissions yet', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS admin grants/removes both roles; existing user session and UI reflect changes');
  await user.getByRole('button', { name: 'Logout', exact: true }).click();
  await user.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  const csrf = (await userContext.cookies()).find((cookie) => cookie.name === 'csrftoken').value;
  const post = (path, data) => userContext.request.post(`${origin}/api/auth/${path}`, {
    data, headers: { 'X-CSRFToken': csrf },
  });
  // Concurrent HTTP requests exercise SQLite's cross-connection budget updates.
  const attempts = await Promise.all(Array.from({ length: 20 }, () =>
    post('verify', { email: 'user@example.com', code: 'wrong' })));
  assert.ok(attempts.every((response) => response.status() === 401));
  for (let retry = 0; retry < 2; retry++) {
    const logStart = backendLog.length;
    assert.equal((await post('request-code', { email: 'user@example.com' })).status(), 200);
    const code = backendLog.slice(logStart).match(/LOGIN CODE user@example\.com (\d{6})/)?.[1];
    assert.ok(code);
    assert.equal((await post('verify', { email: 'user@example.com', code })).status(), 401);
  }
  assert.equal((await userContext.request.get(`${origin}/api/me`)).status(), 401);
  console.log('PASS concurrent verification attempts exhaust persistent budget; reissue cannot bypass it');
  console.log('PASS slice1 browser E2E (real backend, console codes, session cookies and CSRF)');
} finally {
  await browser?.close();
  for (const server of servers) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
  await pause(300);
  rmSync(temporary, { recursive: true, force: true });
}
