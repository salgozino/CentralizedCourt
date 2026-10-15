import { Case, User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

describe('case visibility over HTTP', () => {
  let booted: BootedApp;
  let owner: Browser;
  let admin: Browser;
  let ids: number[];
  beforeAll(async () => {
    booted = await bootApp();
    owner = await new Browser(booted).login('creator1@example.com');
    admin = await new Browser(booted).login('admin@example.com');
    ids = [];
    for (const browser of [owner, admin, owner]) {
      const res = await browser.post('/api/cases', {
        title: 'A dispute',
        description: 'Details',
        outcomes: ['A', 'B'],
        voteWindowSeconds: 120,
      });
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    await booted.dataSource
      .getRepository(Case)
      .createQueryBuilder()
      .update()
      .set({ createdAt: new Date('2026-01-01') })
      .execute();
  });
  afterAll(() => booted.close());
  it('requires authentication for both reads', async () => {
    const anon = new Browser(booted);
    expect((await anon.get('/api/cases')).status).toBe(401);
    expect((await anon.get(`/api/cases/${ids[0]}`)).status).toBe(401);
  });
  it('lists all for admins, newest first with deterministic ID tie-break, without CSRF', async () => {
    const res = await admin.get('/api/cases', { csrf: false, origin: null });
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([...ids].reverse());
  });
  it('lists only owned cases and returns the complete public DTO', async () => {
    const res = await owner.get('/api/cases');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([ids[2], ids[0]]);
    const detail = await owner.get(`/api/cases/${ids[0]}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual({ ...res.body[1], jurors: [] });
    expect(Object.keys(detail.body).sort()).toEqual(
      [
        'id',
        'creatorId',
        'title',
        'description',
        'outcomes',
        'voteWindowSeconds',
        'refusalWindowSeconds',
        'panelSize',
        'selectionMethod',
        'status',
        'result',
        'createdAt',
        'updatedAt',
        'jurors',
      ].sort(),
    );
    expect((await admin.get(`/api/cases/${ids[0]}`)).body).toEqual(detail.body);
  });
  it.each(['creator2@example.com', 'juror1@example.com', 'user@example.com'])(
    'returns an empty list and hides another user’s case for %s',
    async (email) => {
      const browser = await new Browser(booted).login(email);
      const list = await browser.get('/api/cases');
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      const hidden = await browser.get(`/api/cases/${ids[0]}`);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual({ detail: 'Not Found' });
    },
  );
  it('preserves ownership visibility after role removal in the same session', async () => {
    const users = booted.dataSource.getRepository(User);
    const user = await users.findOneByOrFail({ email: 'creator1@example.com' });
    await users.update(user.id, { isCreator: false });
    try {
      expect((await owner.get('/api/cases')).body.map((c: { id: number }) => c.id)).toEqual([ids[2], ids[0]]);
      expect((await owner.get(`/api/cases/${ids[0]}`)).status).toBe(200);
    } finally {
      await users.update(user.id, { isCreator: true });
    }
  });
  it.each(['999999', '0', '-1', 'abc', '1.5', '9007199254740992'])(
    'returns 404 for missing or invalid ID %s',
    async (id) => {
      const res = await admin.get(`/api/cases/${id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ detail: 'Not Found' });
    },
  );
});
