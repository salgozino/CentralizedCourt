import { Client, REQUEST_CODE_DETAIL, newIp, wrongCode } from '../src/client';
import { stdoutMark, stdoutSince } from '../src/stdout';

const JUROR1 = 'juror1@example.com';
const JUROR2 = 'juror2@example.com';
const ADMIN = 'admin@example.com';

describe('POST /api/auth/request-code', () => {
  it('answers identically for known and unknown emails, printing a code only for known ones', async () => {
    const client = new Client();
    const known = await client.post('/api/auth/request-code', { email: JUROR1 });
    const mark = stdoutMark();
    const unknown = await client.post('/api/auth/request-code', { email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(known.body).toEqual({ detail: REQUEST_CODE_DETAIL });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(stdoutSince(mark)).toBe('');
  });

  it('prints exactly one "LOGIN CODE <email> <code>" line, normalising the email', async () => {
    const mark = stdoutMark();
    const res = await new Client().post('/api/auth/request-code', { email: ' Juror1@Example.com ' });
    expect(res.status).toBe(200);
    expect(stdoutSince(mark)).toMatch(/^LOGIN CODE juror1@example\.com \d{6}\n$/);
  });

  it.each([[{}], [{ email: 5 }], [{ foo: 'bar' }]])('rejects invalid body %j with 422', async (body) => {
    const res = await new Client().post('/api/auth/request-code', body);
    expect(res.status).toBe(422);
  });

  it('rejects malformed JSON with 422', async () => {
    const res = await new Client().request('POST', '/api/auth/request-code', { raw: '{nope' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ detail: 'Cannot parse request body' });
  });
});

describe('POST /api/auth/verify', () => {
  it('logs in, returns UserOut and sets the session cookies', async () => {
    const client = new Client();
    const code = await client.requestCode('JUROR1@example.com');
    expect(code).toMatch(/^\d{6}$/);
    const res = await client.verify('Juror1@Example.com', code!);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'roles']);
    expect(res.body).toEqual({ id: expect.any(Number), email: JUROR1, roles: ['juror', 'user'] });
    expect(client.cookie('sessionid')).toBeTruthy();
    expect(client.cookie('csrftoken')).toBeTruthy();
    const me = await client.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body);
  });

  it('sets sessionid HttpOnly+Lax for two weeks and csrftoken readable by JS', async () => {
    const client = new Client();
    await client.login(JUROR1);
    const session = client.rawCookies.get('sessionid')!;
    const csrf = client.rawCookies.get('csrftoken')!;
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(session).toMatch(/;\s*Max-Age=1209600/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('rotates the session id on login', async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    const before = client.cookie('sessionid');
    expect(before).toBeTruthy();
    expect((await client.verify(JUROR1, code!)).status).toBe(200);
    const after = client.cookie('sessionid');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it('sorts roles and always includes "user"', async () => {
    const client = await new Client().login(ADMIN);
    expect((await client.get('/api/me')).body.roles).toEqual(['admin', 'user']);
  });

  it('answers a wrong code with 401 {detail} and leaves the client anonymous', async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    const res = await client.verify(JUROR1, wrongCode(code!));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ detail: 'Invalid or expired code' });
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('rejects a reused code, even from another client', async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    expect((await client.verify(JUROR1, code!)).status).toBe(200);
    expect((await new Client().verify(JUROR1, code!)).status).toBe(401);
  });

  it("rejects a code requested for another user's email", async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    expect((await client.verify(JUROR2, code!)).status).toBe(401);
  });

  it('answers an unknown email with 401', async () => {
    const res = await new Client().verify('nobody@example.com', '123456');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ detail: 'Invalid or expired code' });
  });

  it.each([[{}], [{ email: JUROR1 }], [{ email: JUROR1, code: 123456 }]])('rejects invalid body %j with 422', async (body) => {
    expect((await new Client().post('/api/auth/verify', body)).status).toBe(422);
  });

  it('invalidates the older code when the same session requests a new one', async () => {
    const client = new Client();
    const first = await client.requestCode(JUROR1);
    const second = await client.requestCode(JUROR1);
    expect((await client.verify(JUROR1, first!)).status).toBe(401);
    expect((await client.verify(JUROR1, second!)).status).toBe(200);
  });

  it('allows the correct code after one wrong attempt', async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    expect((await client.verify(JUROR1, wrongCode(code!))).status).toBe(401);
    expect((await client.verify(JUROR1, code!)).status).toBe(200);
  });

  it('binds a code to the session that requested it', async () => {
    const a = new Client();
    const b = new Client();
    const code = await a.requestCode(JUROR1);
    expect((await b.verify(JUROR1, code!)).status).toBe(401);
  });

  it('locks a code after 5 wrong attempts', async () => {
    const client = new Client();
    const code = await client.requestCode(JUROR1);
    for (let i = 0; i < 5; i++) {
      expect((await client.verify(JUROR1, wrongCode(code!))).status).toBe(401);
    }
    expect((await client.verify(JUROR1, code!)).status).toBe(401);
  });
});

describe('GET /api/me, POST /api/auth/logout', () => {
  it('requires login', async () => {
    const res = await new Client().get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ detail: 'Unauthorized' });
  });

  it('logs out and invalidates the session', async () => {
    const client = await new Client().login(JUROR1);
    const res = await client.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ detail: 'Logged out' });
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('succeeds without a session', async () => {
    const res = await new Client().post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ detail: 'Logged out' });
  });
});

describe('IP throttling and X-Forwarded-For', () => {
  it("an attacker's throttling does not block a victim on another IP", async () => {
    const attacker = new Client();
    const victim = new Client();
    for (let i = 0; i < 10; i++) await attacker.requestCode(ADMIN);
    for (let i = 0; i < 25; i++) expect((await attacker.verify(ADMIN, '000000')).status).toBe(401);
    const code = await victim.requestCode(ADMIN);
    expect(code).not.toBeNull();
    expect((await victim.verify(ADMIN, code!)).status).toBe(200);
  });

  it("a victim's code survives requests and guesses from another client", async () => {
    const victim = new Client();
    const attacker = new Client();
    const code = await victim.requestCode(ADMIN);
    await attacker.requestCode(ADMIN);
    for (let i = 0; i < 6; i++) await attacker.verify(ADMIN, wrongCode(code!));
    expect((await victim.verify(ADMIN, code!)).status).toBe(200);
  });

  it('caps code requests at 10 per IP, silently', async () => {
    const spammer = new Client();
    for (let i = 0; i < 10; i++) expect(await spammer.requestCode(JUROR1)).not.toBeNull();
    const mark = stdoutMark();
    const res = await spammer.post('/api/auth/request-code', { email: JUROR1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ detail: REQUEST_CODE_DETAIL });
    expect(stdoutSince(mark)).not.toContain('LOGIN CODE');
    expect(await new Client().requestCode(JUROR1)).not.toBeNull();
  });

  it('counts unknown emails toward the request cap', async () => {
    const spammer = new Client();
    for (let i = 0; i < 10; i++) await spammer.requestCode(`nobody${i}@example.com`);
    expect(await spammer.requestCode(JUROR1)).toBeNull();
  });

  it('caps failed verifications at 20 per IP', async () => {
    const attacker = new Client();
    const code = await attacker.requestCode(JUROR1);
    for (let i = 0; i < 20; i++) await attacker.verify(`nobody${i}@example.com`, '000000');
    expect((await attacker.verify(JUROR1, code!)).status).toBe(401);
    const other = new Client();
    expect((await other.verify(JUROR1, (await other.requestCode(JUROR1))!)).status).toBe(200);
  });

  it('keys throttling on the real client behind the proxy, so one client cannot block another', async () => {
    const attacker = new Client();
    const victim = new Client();
    for (let i = 0; i < 10; i++) await attacker.requestCode(ADMIN);
    for (let i = 0; i < 25; i++) await attacker.verify(ADMIN, '000000');
    const code = await victim.requestCode(ADMIN);
    expect(code).not.toBeNull();
    expect((await victim.verify(ADMIN, code!)).status).toBe(200);
  });

  it('ignores client-controlled (earlier) X-Forwarded-For entries', async () => {
    const decoy = newIp();
    const real = newIp();
    const attacker = Client.withForwardedFor(`${decoy}, ${real}`);
    for (let i = 0; i < 10; i++) expect(await attacker.requestCode(JUROR1)).not.toBeNull();
    expect(await attacker.requestCode(JUROR1)).toBeNull();
    // The decoy bucket is untouched: the cap was charged to the last entry only.
    expect(await Client.withForwardedFor(decoy).requestCode(JUROR1)).not.toBeNull();
  });

  it('falls back to the socket address when the last X-Forwarded-For entry is not an IP', async () => {
    // Remote address is 127.0.0.1 here, so all garbage-tailed requests share that one bucket.
    const decoy = newIp();
    const attacker = Client.withForwardedFor(`${decoy}, garbage`);
    for (let i = 0; i < 10; i++) expect(await attacker.requestCode(JUROR1)).not.toBeNull();
    expect(await attacker.requestCode(JUROR1)).toBeNull();
    expect(await Client.withForwardedFor(decoy).requestCode(JUROR1)).not.toBeNull();
  });
});
