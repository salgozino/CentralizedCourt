import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { z } from 'zod';

import { CsrfGuard } from '../src/auth/csrf.guard';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { Session, User } from '../src/entities';
import { ZodBodyPipe } from '../src/http/validation';
import { SessionModule } from '../src/session/session.module';
import { SessionService } from '../src/session/session.service';

import { Browser, BootedApp, bootApp } from './helpers';

const JUROR1 = 'juror1@example.com';

const EchoIn = z.object({ name: z.string() });

/** Stands in for the admin routes: session auth first, then CSRF, then body validation. */
@Controller('probe')
@UseGuards(SessionAuthGuard, CsrfGuard)
class ProbeController {
  @Post()
  write() {
    return { ok: true };
  }

  @Post('echo')
  echo(@Body(new ZodBodyPipe(EchoIn)) body: z.infer<typeof EchoIn>) {
    return body;
  }
}

/**
 * Unguarded route that changes one session key, then waits for the test to let it finish. Holding
 * several requests between "session loaded" and "response ready" makes request overlap deterministic.
 */
@Controller('session-probe')
class SessionProbeController {
  static arrivals = 0;
  static release: Promise<void> = Promise.resolve();

  constructor(private readonly sessions: SessionService) {}

  @Post(':name')
  async touch(@Req() req: Request, @Param('name') name: string) {
    const session = await this.sessions.get(req);
    session.set(name, true);
    SessionProbeController.arrivals++;
    await SessionProbeController.release;
    return { ok: true };
  }
}

/** Starts holding session-probe requests; call the returned function to let them finish. */
function holdSessionProbes(): () => void {
  let open!: () => void;
  SessionProbeController.arrivals = 0;
  SessionProbeController.release = new Promise<void>((resolve) => (open = resolve));
  return open;
}

async function untilArrivals(count: number): Promise<void> {
  while (SessionProbeController.arrivals < count) await new Promise((resolve) => setTimeout(resolve, 5));
}

/** Makes every write to the sessions table fail, to simulate a database error while a session is saved. */
async function breakSessionWrites(ds: DataSource): Promise<() => Promise<void>> {
  const abort = "BEGIN SELECT RAISE(ABORT, 'sessions are read-only'); END";
  await ds.query(`CREATE TRIGGER sessions_no_insert BEFORE INSERT ON sessions ${abort}`);
  await ds.query(`CREATE TRIGGER sessions_no_update BEFORE UPDATE ON sessions ${abort}`);
  return async () => {
    await ds.query('DROP TRIGGER sessions_no_insert');
    await ds.query('DROP TRIGGER sessions_no_update');
  };
}

describe('auth over HTTP', () => {
  let booted: BootedApp;
  let ds: DataSource;

  beforeAll(async () => {
    booted = await bootApp({ imports: [SessionModule], controllers: [ProbeController, SessionProbeController] });
    ds = booted.dataSource;
  });
  afterAll(() => booted.close());

  describe('cookies', () => {
    it('sets an opaque HttpOnly sessionid and a JS-readable csrftoken on verify', async () => {
      const b = new Browser(booted);
      await b.login(JUROR1);
      const session = b.rawCookies.get('sessionid')!;
      const csrf = b.rawCookies.get('csrftoken')!;
      expect(session).toMatch(/; HttpOnly/);
      expect(session).toMatch(/; SameSite=Lax/i);
      expect(session).toMatch(/; Path=\//);
      expect(session).toMatch(/; Max-Age=1209600/);
      expect(csrf).not.toMatch(/HttpOnly/);
      expect(csrf).toMatch(/; SameSite=Lax/i);
      expect(csrf).toMatch(/; Path=\//);
      const key = b.jar.get('sessionid')!;
      expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(await ds.getRepository(Session).existsBy({ id: key })).toBe(true);
    });

    it('rotates the session key on login but keeps one row per live session', async () => {
      const b = new Browser(booted);
      const code = await b.requestCode(JUROR1);
      const before = b.jar.get('sessionid')!;
      expect((await b.verify(JUROR1, code)).status).toBe(200);
      const after = b.jar.get('sessionid')!;
      expect(after).not.toBe(before);
      expect(await ds.getRepository(Session).existsBy({ id: before })).toBe(false);
      expect(await ds.getRepository(Session).existsBy({ id: after })).toBe(true);
    });

    it('sets the same sessionid cookie for known and unknown emails on request-code', async () => {
      const attributes = (raw: string) => raw.replace(/^sessionid=[^;]*/, '').replace(/expires=[^;]*/i, '');
      const known = new Browser(booted);
      const unknown = new Browser(booted);
      expect((await known.post('/api/auth/request-code', { email: JUROR1 })).status).toBe(200);
      const res = await unknown.post('/api/auth/request-code', { email: 'nobody@example.com' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ detail: 'If the email exists, a code was sent.' });
      expect(unknown.jar.get('sessionid')).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(attributes(unknown.rawCookies.get('sessionid')!)).toBe(attributes(known.rawCookies.get('sessionid')!));
    });

    it('keeps answering unknown emails like known ones when a session cookie is already present', async () => {
      const b = new Browser(booted);
      await b.post('/api/auth/request-code', { email: 'nobody@example.com' });
      const res = await b.post('/api/auth/request-code', { email: 'nobody@example.com' });
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('sets csrftoken on GET /api/me, reusing the existing secret', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const before = b.jar.get('csrftoken');
      const me = await b.get('/api/me');
      expect(
        (me.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) => c.startsWith('csrftoken=')),
      ).toBe(true);
      expect(b.jar.get('csrftoken')).toBe(before);
    });

    it('logout deletes the session row and clears the cookie', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const key = b.jar.get('sessionid')!;
      const res = await b.post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(b.rawCookies.get('sessionid')).toMatch(/^sessionid=("")?; .*Max-Age=0/i);
      expect(b.rawCookies.get('sessionid')).toMatch(/Expires=Thu, 01 Jan 1970/i);
      expect(await ds.getRepository(Session).existsBy({ id: key })).toBe(false);
      expect((await b.get('/api/me', { cookies: { sessionid: key } })).status).toBe(401);
    });

    it('logout without a cookie sets nothing', async () => {
      const res = await new Browser(booted).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('session writes', () => {
    it('keeps the changes of two overlapping requests on the same session', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const key = b.jar.get('sessionid')!;
      const open = holdSessionProbes();
      const both = Promise.all([b.post('/api/session-probe/first'), b.post('/api/session-probe/second')]);
      await untilArrivals(2);
      open();
      expect((await both).map((r) => r.status)).toEqual([201, 201]);
      const row = await ds.getRepository(Session).findOneByOrFail({ id: key });
      expect(row.data).toMatchObject({ first: true, second: true });
      expect(typeof row.data.userId).toBe('number');
    });

    it('does not resurrect a session that logout deleted while another request was in flight', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const key = b.jar.get('sessionid')!;
      const open = holdSessionProbes();
      const slow = b.post('/api/session-probe/late');
      await untilArrivals(1);
      expect((await b.post('/api/auth/logout', undefined, { cookies: { sessionid: key } })).status).toBe(200);
      open();
      expect((await slow).status).toBe(201);
      expect(await ds.getRepository(Session).existsBy({ id: key })).toBe(false);
      expect((await b.get('/api/me', { cookies: { sessionid: key } })).status).toBe(401);
    });

    it('gives a rotated session a fresh row, never the old key, when the old row vanished meanwhile', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const oldKey = b.jar.get('sessionid')!;
      const sessions = booted.app.get(SessionService);
      const req = { headers: { cookie: `sessionid=${oldKey}` } } as Request;
      const cookies: string[] = [];
      const res = {
        headersSent: false,
        append: (_name: string, value: string) => cookies.push(value),
      } as unknown as Response;
      const handle = await sessions.get(req);
      handle.cycleKey();
      handle.set('rotated', true);
      await ds.getRepository(Session).delete({ id: oldKey });
      await sessions.commit(req, res);
      const newKey = /^sessionid=([^;]+)/.exec(cookies[0])![1];
      expect(newKey).not.toBe(oldKey);
      expect(await ds.getRepository(Session).existsBy({ id: oldKey })).toBe(false);
      expect((await ds.getRepository(Session).findOneByOrFail({ id: newKey })).data).toEqual({ rotated: true });
    });

    it('leaves the code usable when the session cannot be saved on verify', async () => {
      const b = new Browser(booted);
      const code = await b.requestCode(JUROR1);
      const cookies = { sessionid: b.jar.get('sessionid')! };
      const restore = await breakSessionWrites(ds);
      let failed;
      try {
        failed = await b.verify(JUROR1, code);
      } finally {
        await restore();
      }
      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ detail: 'Internal Server Error' });
      expect(
        ([failed.headers['set-cookie'] ?? []].flat() as string[]).filter((c) => c.startsWith('sessionid=')),
      ).toEqual([]);
      const retry = await b.post('/api/auth/verify', { email: JUROR1, code }, { cookies });
      expect(retry.status).toBe(200);
      expect(retry.body.email).toBe(JUROR1);
    });
  });

  describe('session auth', () => {
    it('ignores an expired session', async () => {
      const b = await new Browser(booted).login(JUROR1);
      await ds
        .getRepository(Session)
        .update({ id: b.jar.get('sessionid')! }, { expiresAt: new Date(Date.now() - 1000) });
      expect((await b.get('/api/me')).status).toBe(401);
    });

    it('ignores an unknown or malformed session key', async () => {
      const b = new Browser(booted);
      expect((await b.get('/api/me', { cookies: { sessionid: 'nope' } })).status).toBe(401);
      expect((await b.get('/api/me', { cookies: { sessionid: 'x'.repeat(32) } })).status).toBe(401);
    });

    it('loads the user fresh on every request (role changes need no relogin)', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const users = ds.getRepository(User);
      try {
        await users.update({ email: JUROR1 }, { isCreator: true });
        expect((await b.get('/api/me')).body.roles).toEqual(['creator', 'juror', 'user']);
      } finally {
        await users.update({ email: JUROR1 }, { isCreator: false });
      }
      expect((await b.get('/api/me')).body.roles).toEqual(['juror', 'user']);
    });

    it('treats inactive users as unauthenticated', async () => {
      const b = await new Browser(booted).login('juror2@example.com');
      const users = ds.getRepository(User);
      try {
        await users.update({ email: 'juror2@example.com' }, { isActive: false });
        const res = await b.get('/api/me');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ detail: 'Unauthorized' });
      } finally {
        await users.update({ email: 'juror2@example.com' }, { isActive: true });
      }
    });
  });

  describe('CsrfGuard', () => {
    it('answers anonymous requests with 401 before any CSRF check', async () => {
      const res = await new Browser(booted).post('/api/probe', undefined, {
        csrf: false,
        origin: 'http://evil.example',
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ detail: 'Unauthorized' });
    });

    it('accepts a matching X-CSRFToken from a trusted origin', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const res = await b.post('/api/probe');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
    });

    it.each(['http://localhost:5173', 'http://127.0.0.1:5173'])('trusts origin %s', async (origin) => {
      const b = await new Browser(booted).login(JUROR1);
      expect((await b.post('/api/probe', undefined, { origin })).status).toBe(201);
    });

    it('accepts a request without an Origin header (over plain http)', async () => {
      const b = await new Browser(booted).login(JUROR1);
      expect((await b.post('/api/probe', undefined, { origin: null })).status).toBe(201);
    });

    it('accepts the masked 64-char form of the token', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const secret = b.jar.get('csrftoken')!;
      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const mask = 'q'.repeat(32);
      const cipher = [...secret]
        .map((ch, i) => alphabet[(alphabet.indexOf(ch) + alphabet.indexOf(mask[i])) % alphabet.length])
        .join('');
      const res = await b.post('/api/probe', undefined, { headers: { 'X-CSRFToken': mask + cipher } });
      expect(res.status).toBe(201);
    });

    it.each([
      ['missing header', { csrf: false }],
      ['wrong header', { headers: { 'X-CSRFToken': 'x'.repeat(32) } }],
      ['malformed header', { headers: { 'X-CSRFToken': 'short' } }],
      ['untrusted origin', { origin: 'http://evil.example' }],
    ])('rejects %s with 403', async (_name, opts) => {
      const b = await new Browser(booted).login(JUROR1);
      const res = await b.post('/api/probe', undefined, opts);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'CSRF check Failed' });
    });

    it('rejects when the csrftoken cookie is missing', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const token = b.jar.get('csrftoken')!;
      const res = await b.post('/api/probe', undefined, {
        csrf: false,
        headers: { 'X-CSRFToken': token },
        dropCookies: ['csrftoken'],
      });
      expect(res.status).toBe(403);
    });
  });

  describe('error shapes', () => {
    it('maps malformed JSON to 422 {detail: "Cannot parse request body"}', async () => {
      const res = await new Browser(booted).post('/api/auth/request-code', undefined, { raw: '{nope' });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ detail: 'Cannot parse request body' });
    });

    it('describes a missing body like pydantic', async () => {
      const res = await new Browser(booted).post('/api/auth/request-code');
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ detail: [{ type: 'missing', loc: ['body', 'payload'], msg: 'Field required' }] });
    });

    it('describes missing and mistyped fields like pydantic', async () => {
      const b = new Browser(booted);
      expect((await b.post('/api/auth/request-code', {})).body).toEqual({
        detail: [{ type: 'missing', loc: ['body', 'payload', 'email'], msg: 'Field required' }],
      });
      expect((await b.post('/api/auth/request-code', { email: 5 })).body).toEqual({
        detail: [{ type: 'string_type', loc: ['body', 'payload', 'email'], msg: 'Input should be a valid string' }],
      });
      const verify = await b.post('/api/auth/verify', { email: JUROR1, code: 123456 });
      expect(verify.status).toBe(422);
      expect(verify.body.detail[0].loc).toEqual(['body', 'payload', 'code']);
    });

    it('rejects a non-object body with 422', async () => {
      const res = await new Browser(booted).post('/api/auth/request-code', undefined, { raw: '[]' });
      expect(res.status).toBe(422);
      expect(Array.isArray(res.body.detail)).toBe(true);
    });

    it('answers unknown routes with 404 {detail: "Not Found"}', async () => {
      const res = await new Browser(booted).get('/api/nope');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ detail: 'Not Found' });
    });

    it('answers an invalid body with 401 when anonymous and 422 when authenticated', async () => {
      const anonymous = await new Browser(booted).post('/api/probe/echo', { name: 5 });
      expect(anonymous.status).toBe(401);
      expect(anonymous.body).toEqual({ detail: 'Unauthorized' });
      const authenticated = await (await new Browser(booted).login(JUROR1)).post('/api/probe/echo', { name: 5 });
      expect(authenticated.status).toBe(422);
      expect(authenticated.body.detail[0].loc).toEqual(['body', 'payload', 'name']);
    });

    it('keeps the {detail} shape for body-parser errors other than malformed JSON', async () => {
      const b = new Browser(booted);
      const tooLarge = await b.post('/api/auth/request-code', undefined, {
        raw: JSON.stringify({ email: 'x'.repeat(200_000) }),
      });
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body).toEqual({ detail: 'request entity too large' });
      const charset = await b.post('/api/auth/request-code', undefined, {
        raw: '{}',
        headers: { 'Content-Type': 'application/json; charset=latin1' },
      });
      expect(charset.status).toBe(415);
      expect(charset.body).toEqual({ detail: 'unsupported charset "LATIN1"' });
      const encoding = await b.post('/api/auth/request-code', undefined, {
        raw: '{}',
        headers: { 'Content-Encoding': 'compress' },
      });
      expect(encoding.status).toBe(415);
      expect(encoding.body).toEqual({ detail: 'unsupported content encoding "compress"' });
    });
  });

  describe('verify failures', () => {
    it('answers a wrong code with 401 {detail} and leaves the session and the real code alone', async () => {
      const b = new Browser(booted);
      const code = await b.requestCode(JUROR1);
      const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
      const res = await b.verify(JUROR1, wrong);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ detail: 'Invalid or expired code' });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect((await b.verify(JUROR1, code)).status).toBe(200);
    });

    it('answers an unknown email with the same 401', async () => {
      const res = await new Browser(booted).verify('nobody@example.com', '000000');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ detail: 'Invalid or expired code' });
    });
  });
});
