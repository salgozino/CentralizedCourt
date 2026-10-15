import { Client } from '../src/client';

const LIST_URL = '/api/admin/users';
const rolesUrl = (id: number) => `/api/admin/users/${id}/roles`;
const NON_ADMINS = ['creator1@example.com', 'juror1@example.com', 'user@example.com'];

const SEED_EXTRA_ROLES: Record<string, string[]> = {
  'admin@example.com': [],
  'creator1@example.com': ['creator'],
  'creator2@example.com': ['creator'],
  'juror1@example.com': ['juror'],
  'juror2@example.com': ['juror'],
  'juror3@example.com': ['juror'],
  'juror4@example.com': ['juror'],
  'juror5@example.com': ['juror'],
  'user@example.com': [],
};

let ids: Record<string, number>;
const idOf = (email: string) => ids[email];

async function adminClient(): Promise<Client> {
  return new Client().login('admin@example.com');
}

beforeAll(async () => {
  const res = await (await adminClient()).get(LIST_URL);
  ids = Object.fromEntries(res.body.map((u: { email: string; id: number }) => [u.email, u.id]));
});

/** Tests share one backend; every test that changes roles must run inside this block. */
describe('role mutations', () => {
  afterEach(async () => {
    const admin = await adminClient();
    for (const [email, roles] of Object.entries(SEED_EXTRA_ROLES)) {
      expect((await admin.put(rolesUrl(idOf(email)), { roles })).status).toBe(200);
    }
  });

  it('grants roles and the user sees them', async () => {
    const res = await (await adminClient()).put(rolesUrl(idOf('user@example.com')), { roles: ['creator', 'juror'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: idOf('user@example.com'),
      email: 'user@example.com',
      roles: ['creator', 'juror', 'user'],
    });
    const me = await (await new Client().login('user@example.com')).get('/api/me');
    expect(me.body.roles).toEqual(['creator', 'juror', 'user']);
  });

  it('dedupes repeated roles', async () => {
    const res = await (await adminClient()).put(rolesUrl(idOf('user@example.com')), { roles: ['juror', 'juror'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['juror', 'user']);
  });

  it('removes roles', async () => {
    // Seeded jurors may sit on cases other files left voting, so grant and remove on a user no draw has seen.
    const admin = await adminClient();
    expect((await admin.put(rolesUrl(idOf('user@example.com')), { roles: ['creator', 'juror'] })).status).toBe(200);
    const res = await admin.put(rolesUrl(idOf('user@example.com')), { roles: [] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['user']);
  });

  it('refuses to remove the juror role while the user is on an active case', async () => {
    const admin = await adminClient();
    expect((await admin.put(rolesUrl(idOf('user@example.com')), { roles: ['juror'] })).status).toBe(200);
    const creator = await new Client().login('creator1@example.com');
    const created = await creator.post('/api/cases', {
      title: 'Juror role removal',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 3600,
      selectionMethod: 'manual',
    });
    const panel = ['user@example.com', 'juror4@example.com', 'juror5@example.com'];
    const draw = await creator.post(`/api/cases/${created.body.id}/draw`, { jurorIds: panel.map(idOf) });
    expect(draw.status).toBe(200);

    const refused = await admin.put(rolesUrl(idOf('user@example.com')), { roles: [] });
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ detail: 'Cannot remove the juror role while the user is on an active case' });
    expect(
      (await admin.get(LIST_URL)).body.find((u: { email: string }) => u.email === 'user@example.com').roles,
    ).toEqual(['juror', 'user']);

    // Once every juror voted the case is resolved and the role can go (this also leaves no active case behind).
    for (const email of panel) {
      const juror = await new Client().login(email);
      expect((await juror.post(`/api/cases/${created.body.id}/vote`, { outcomeIndex: 0 })).status).toBe(200);
    }
    const removed = await admin.put(rolesUrl(idOf('user@example.com')), { roles: [] });
    expect(removed.status).toBe(200);
    expect(removed.body.roles).toEqual(['user']);
  });

  it('keeps the admin flag when an admin edits their own roles', async () => {
    const res = await (await adminClient()).put(rolesUrl(idOf('admin@example.com')), { roles: ['juror'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['admin', 'juror', 'user']);
  });

  it('keeps the admin flag when roles are cleared', async () => {
    const res = await (await adminClient()).put(rolesUrl(idOf('admin@example.com')), { roles: [] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['admin', 'user']);
  });

  it('applies role changes to an already logged-in user without relogin', async () => {
    const user = await new Client().login('user@example.com');
    expect((await user.get('/api/me')).body.roles).toEqual(['user']);
    await (await adminClient()).put(rolesUrl(idOf('user@example.com')), { roles: ['creator'] });
    expect((await user.get('/api/me')).body.roles).toEqual(['creator', 'user']);
  });

  it('succeeds with the CSRF token header and a trusted Origin', async () => {
    const admin = await adminClient();
    const token = admin.cookie('csrftoken');
    expect(token).toBeTruthy();
    const res = await admin.put(
      rolesUrl(idOf('user@example.com')),
      { roles: ['juror'] },
      { csrf: false, headers: { 'X-CSRFToken': token! } },
    );
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['juror', 'user']);
  });
});

describe('GET /api/admin/users', () => {
  it('requires login (401)', async () => {
    const res = await new Client().get(LIST_URL);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ detail: 'Unauthorized' });
  });

  it.each(NON_ADMINS)('is forbidden for %s (403 {detail})', async (email) => {
    const res = await (await new Client().login(email)).get(LIST_URL);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ detail: 'Only admins can manage users' });
  });

  it('lists all users ordered by id with sorted roles', async () => {
    const res = await (await adminClient()).get(LIST_URL);
    expect(res.status).toBe(200);
    const data = res.body as { id: number; email: string; roles: string[] }[];
    expect(data).toHaveLength(9);
    expect(data.map((u) => u.id)).toEqual(data.map((u) => u.id).sort((a, b) => a - b));
    const byEmail = Object.fromEntries(data.map((u) => [u.email, u.roles]));
    expect(byEmail['admin@example.com']).toEqual(['admin', 'user']);
    expect(byEmail['creator2@example.com']).toEqual(['creator', 'user']);
    expect(byEmail['juror5@example.com']).toEqual(['juror', 'user']);
    expect(byEmail['user@example.com']).toEqual(['user']);
    expect(Object.keys(data[0]).sort()).toEqual(['email', 'id', 'roles']);
  });
});

describe('PUT /api/admin/users/{id}/roles ordering: 401 > 403 > 422 > 404', () => {
  it('requires login (401)', async () => {
    const res = await new Client().put(rolesUrl(idOf('user@example.com')), { roles: [] });
    expect(res.status).toBe(401);
  });

  it.each(NON_ADMINS)('is forbidden for %s even with an invalid body (403)', async (email) => {
    const client = await new Client().login(email);
    for (const body of [{ roles: ['creator'] }, { roles: ['admin'] }, { nope: 1 }]) {
      const res = await client.put(rolesUrl(idOf('user@example.com')), body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'Only admins can manage users' });
    }
  });

  it('answers 404 for an unknown user', async () => {
    const res = await (await adminClient()).put(rolesUrl(999999), { roles: ['creator'] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ detail: 'Not Found' });
  });

  it.each([
    [{ roles: ['admin'] }],
    [{ roles: ['user'] }],
    [{ roles: ['superhero'] }],
    [{ roles: ['creator', 'admin'] }],
    [{}],
    [{ roles: 'creator' }],
    [{ roles: null }],
  ])('answers 422 for invalid body %j', async (body) => {
    const res = await (await adminClient()).put(rolesUrl(idOf('user@example.com')), body);
    expect(res.status).toBe(422);
  });

  it('answers 422 for malformed JSON', async () => {
    const res = await (await adminClient()).request('PUT', rolesUrl(idOf('user@example.com')), { raw: '{nope' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ detail: 'Cannot parse request body' });
  });

  it('prefers 422 over 404 when the body is invalid and the user unknown', async () => {
    const res = await (await adminClient()).put(rolesUrl(999999), { roles: ['admin'] });
    expect(res.status).toBe(422);
  });
});

describe('CSRF on authenticated unsafe requests', () => {
  it('anonymous PUT without token is 401, not 403', async () => {
    const res = await new Client().put(rolesUrl(idOf('user@example.com')), { roles: [] }, { csrf: false });
    expect(res.status).toBe(401);
  });

  it('anonymous GET list is 401', async () => {
    expect((await new Client().get(LIST_URL)).status).toBe(401);
  });

  it('admin PUT without the token header is 403 mentioning CSRF', async () => {
    const admin = await adminClient();
    const res = await admin.put(rolesUrl(idOf('user@example.com')), { roles: ['juror'] }, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('CSRF');
  });

  it('admin PUT from an untrusted Origin is 403 mentioning CSRF', async () => {
    const admin = await adminClient();
    const res = await admin.put(
      rolesUrl(idOf('user@example.com')),
      { roles: ['juror'] },
      { headers: { Origin: 'http://evil.example' } },
    );
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('CSRF');
  });

  it('non-admin PUT with a valid token is 403 for the role, not CSRF', async () => {
    const user = await new Client().login('user@example.com');
    const res = await user.put(
      rolesUrl(idOf('user@example.com')),
      { roles: ['juror'] },
      { csrf: false, headers: { 'X-CSRFToken': user.cookie('csrftoken')! } },
    );
    expect(res.status).toBe(403);
    expect(res.body.detail).not.toContain('CSRF');
  });
});
