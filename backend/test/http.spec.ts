import { Controller, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Session, User } from '../src/entities';
import { CsrfGuard } from '../src/auth/csrf.guard';
import { SessionAuthGuard } from '../src/auth/session-auth.guard';
import { SessionModule } from '../src/session/session.module';
import { Browser, BootedApp, bootApp } from './helpers';

const JUROR1 = 'juror1@example.com';

/** Stands in for the admin routes of task 4: session auth first, then CSRF. */
@Controller('probe')
@UseGuards(SessionAuthGuard, CsrfGuard)
class ProbeController {
  @Post()
  write() {
    return { ok: true };
  }
}

describe('auth over HTTP', () => {
  let booted: BootedApp;
  let ds: DataSource;

  beforeAll(async () => {
    booted = await bootApp({ imports: [SessionModule], controllers: [ProbeController] });
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

    it('sets no cookie when request-code does not touch the session (unknown email)', async () => {
      const b = new Browser(booted);
      const res = await b.post('/api/auth/request-code', { email: 'nobody@example.com' });
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('sets csrftoken on GET /api/me, reusing the existing secret', async () => {
      const b = await new Browser(booted).login(JUROR1);
      const before = b.jar.get('csrftoken');
      const me = await b.get('/api/me');
      expect((me.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) => c.startsWith('csrftoken='))).toBe(true);
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

  describe('session auth', () => {
    it('ignores an expired session', async () => {
      const b = await new Browser(booted).login(JUROR1);
      await ds.getRepository(Session).update({ id: b.jar.get('sessionid')! }, { expiresAt: new Date(Date.now() - 1000) });
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
      const res = await new Browser(booted).post('/api/probe', undefined, { csrf: false, origin: 'http://evil.example' });
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
      const res = await b.post('/api/probe', undefined, { csrf: false, headers: { 'X-CSRFToken': token }, dropCookies: ['csrftoken'] });
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

    it('orders 401 before 422 on guarded routes', async () => {
      const res = await new Browser(booted).get('/api/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ detail: 'Unauthorized' });
    });
  });
});
