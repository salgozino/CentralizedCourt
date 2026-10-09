import { User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const payload = {
  title: 'A dispute',
  description: 'Details',
  outcomes: ['A', 'B'],
  voteWindowSeconds: 120,
};

/** mulberry32: small seeded PRNG so draws are reproducible in tests. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface JurorOut {
  jurorId: number;
  name: string;
  drawnAt: string;
  deadline: string;
}

describe('jury draw over HTTP', () => {
  let booted: BootedApp;
  let owner: Browser;
  let admin: Browser;
  let next: () => number = seeded(1);
  const users = () => booted.dataSource.getRepository(User);
  const createCase = async (browser: Browser, extra: Record<string, unknown> = {}): Promise<number> => {
    const res = await browser.post('/api/cases', { ...payload, ...extra });
    expect(res.status).toBe(201);
    return res.body.id;
  };
  const idOf = async (email: string) => (await users().findOneByOrFail({ email })).id;

  beforeAll(async () => {
    // Token name of the injectable RNG: returns an integer in [0, maxExclusive).
    booted = await bootApp({
      overrides: [{ provide: 'DRAW_RNG', useValue: (maxExclusive: number) => Math.floor(next() * maxExclusive) }],
    });
    owner = await new Browser(booted).login('creator1@example.com');
    admin = await new Browser(booted).login('admin@example.com');
  });
  afterAll(() => booted.close());

  it('requires a session and CSRF', async () => {
    const id = await createCase(owner);
    expect((await new Browser(booted).post(`/api/cases/${id}/draw`)).status).toBe(401);
    const res = await owner.post(`/api/cases/${id}/draw`, undefined, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ detail: 'CSRF check Failed' });
  });

  it.each(['999999', 'abc', '0'])('returns 404 for missing or invalid case %s', async (id) => {
    const res = await admin.post(`/api/cases/${id}/draw`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ detail: 'Not Found' });
  });

  it.each(['creator2@example.com', 'juror1@example.com', 'user@example.com'])(
    'forbids %s from drawing on another user’s case',
    async (email) => {
      const id = await createCase(owner);
      const browser = await new Browser(booted).login(email);
      const res = await browser.post(`/api/cases/${id}/draw`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'Only the case creator or an admin can draw jurors' });
      expect((await owner.get(`/api/cases/${id}`)).body.status).toBe('awaiting_jurors');
    },
  );

  it('lets the creator draw panelSize distinct jurors, each with deadline = drawnAt + window', async () => {
    const id = await createCase(owner);
    const before = Date.now();
    const res = await owner.post(`/api/cases/${id}/draw`);
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.body.case.status).toBe('voting');
    const jurors: JurorOut[] = res.body.jurors;
    expect(jurors).toHaveLength(3);
    expect(res.body.case.jurors).toEqual(jurors);
    expect(new Set(jurors.map((j) => j.jurorId)).size).toBe(3);
    for (const juror of jurors) {
      const user = await users().findOneByOrFail({ id: juror.jurorId });
      expect(user.isJuror).toBe(true);
      expect(user.isAdmin).toBe(false);
      expect(juror.name).toBe(user.name);
      expect(Object.keys(juror).sort()).toEqual(['deadline', 'drawnAt', 'jurorId', 'name']);
      const drawnAt = new Date(juror.drawnAt).getTime();
      expect(drawnAt).toBeGreaterThanOrEqual(before - 1000);
      expect(drawnAt).toBeLessThanOrEqual(after + 1000);
      expect(new Date(juror.deadline).getTime() - drawnAt).toBe(120 * 1000);
    }
    expect((await owner.get(`/api/cases/${id}`)).body.status).toBe('voting');
  });

  it('lets an admin draw on any case and answers 409 on a second draw', async () => {
    const id = await createCase(owner);
    expect((await admin.post(`/api/cases/${id}/draw`)).status).toBe(200);
    const again = await owner.post(`/api/cases/${id}/draw`);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ detail: 'Jurors can only be drawn while the case is awaiting jurors' });
  });

  it('answers 409 when there are fewer eligible jurors than panelSize, never counting admins', async () => {
    const adminUser = await users().findOneByOrFail({ email: 'admin@example.com' });
    const juror5 = await users().findOneByOrFail({ email: 'juror5@example.com' });
    await users().update(adminUser.id, { isJuror: true });
    await users().update(juror5.id, { isJuror: false });
    try {
      const id = await createCase(owner, { panelSize: 5 });
      const res = await owner.post(`/api/cases/${id}/draw`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ detail: 'Not enough eligible jurors: 4 available, 5 required' });
      expect((await owner.get(`/api/cases/${id}`)).body.status).toBe('awaiting_jurors');
    } finally {
      await users().update(adminUser.id, { isJuror: false });
      await users().update(juror5.id, { isJuror: true });
    }
  });

  it('draws the same 3 jurors every time with a fixed seed', async () => {
    const draws: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const id = await createCase(owner);
      next = seeded(42);
      const res = await owner.post(`/api/cases/${id}/draw`);
      expect(res.status).toBe(200);
      draws.push(res.body.jurors.map((j: JurorOut) => j.jurorId));
    }
    expect(draws[1]).toEqual(draws[0]);
    expect(draws[2]).toEqual(draws[0]);
    const all = await users().find();
    const jurorIds = all.filter((u) => u.isJuror && !u.isAdmin).map((u) => u.id);
    for (const userId of draws[0]) expect(jurorIds).toContain(userId);
  });

  it('rejects jurorIds on a random case', async () => {
    const id = await createCase(owner);
    const res = await owner.post(`/api/cases/${id}/draw`, { jurorIds: [await idOf('juror1@example.com')] });
    expect(res.status).toBe(422);
  });

  describe('manual assignment', () => {
    it('assigns exactly the given jurors', async () => {
      const id = await createCase(owner, { selectionMethod: 'manual' });
      const jurorIds = [
        await idOf('juror4@example.com'),
        await idOf('juror1@example.com'),
        await idOf('juror2@example.com'),
      ];
      const res = await owner.post(`/api/cases/${id}/draw`, { jurorIds });
      expect(res.status).toBe(200);
      expect(res.body.case.status).toBe('voting');
      expect(res.body.jurors.map((j: JurorOut) => j.jurorId)).toEqual(jurorIds);
      for (const juror of res.body.jurors as JurorOut[])
        expect(new Date(juror.deadline).getTime() - new Date(juror.drawnAt).getTime()).toBe(120 * 1000);
    });

    it.each([
      ['a plain user', ['juror1@example.com', 'juror2@example.com', 'user@example.com']],
      ['a creator', ['juror1@example.com', 'juror2@example.com', 'creator2@example.com']],
    ])('rejects %s with 422 and keeps the case awaiting jurors', async (_label, emails) => {
      const id = await createCase(owner, { selectionMethod: 'manual' });
      const jurorIds = await Promise.all(emails.map(idOf));
      const res = await owner.post(`/api/cases/${id}/draw`, { jurorIds });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ detail: 'Only users with the juror role can be assigned' });
      expect((await owner.get(`/api/cases/${id}`)).body.status).toBe('awaiting_jurors');
    });

    it('rejects an admin even with the juror flag', async () => {
      const adminUser = await users().findOneByOrFail({ email: 'admin@example.com' });
      await users().update(adminUser.id, { isJuror: true });
      try {
        const id = await createCase(owner, { selectionMethod: 'manual' });
        const jurorIds = [await idOf('juror1@example.com'), await idOf('juror2@example.com'), adminUser.id];
        const res = await owner.post(`/api/cases/${id}/draw`, { jurorIds });
        expect(res.status).toBe(422);
        expect(res.body).toEqual({ detail: 'Only users with the juror role can be assigned' });
      } finally {
        await users().update(adminUser.id, { isJuror: false });
      }
    });

    it.each([
      ['missing', undefined],
      ['too few', ['juror1@example.com', 'juror2@example.com']],
      ['duplicated', ['juror1@example.com', 'juror1@example.com', 'juror2@example.com']],
    ])('rejects %s jurorIds with 422', async (_label, emails) => {
      const id = await createCase(owner, { selectionMethod: 'manual' });
      const body = emails ? { jurorIds: await Promise.all(emails.map(idOf)) } : {};
      const res = await owner.post(`/api/cases/${id}/draw`, body);
      expect(res.status).toBe(422);
      expect((await owner.get(`/api/cases/${id}`)).body.status).toBe('awaiting_jurors');
    });
  });
});
