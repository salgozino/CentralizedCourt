import { Case, User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const payload = {
  title: 'Conflict case',
  description: 'Details',
  outcomes: ['A', 'B'],
  voteWindowSeconds: 120,
  selectionMethod: 'manual',
  refusalWindowSeconds: 60,
  panelSize: 3,
};

describe('manual refusal lifecycle over HTTP', () => {
  let app: BootedApp;
  let owner: Browser;
  let admin: Browser;
  let jurors: Browser[];
  let ids: number[];
  let now: Date;
  const path = (id: number) => `/api/cases/${id}`;
  const create = async (extra = {}) => {
    const res = await owner.post('/api/cases', { ...payload, ...extra });
    expect(res.status).toBe(201);
    return res.body.id as number;
  };
  const draw = async (id: number, panel = ids.slice(0, 3)) => {
    const res = await owner.post(`${path(id)}/draw`, { jurorIds: panel });
    expect(res.status).toBe(200);
    expect(res.body.case.status).toBe('refusal');
    return res.body.case;
  };
  beforeAll(async () => {
    now = new Date('2030-01-01T00:00:00Z');
    app = await bootApp({ overrides: [{ provide: 'CLOCK', useValue: () => now }] });
    owner = await new Browser(app).login('creator1@example.com');
    admin = await new Browser(app).login('admin@example.com');
    jurors = [];
    ids = [];
    for (let i = 1; i <= 5; i++) {
      const email = `juror${i}@example.com`;
      jurors.push(await new Browser(app).login(email));
      ids.push((await app.dataSource.getRepository(User).findOneByOrFail({ email })).id);
    }
  });
  afterAll(() => app.close());
  beforeEach(() => {
    now = new Date('2030-01-01T00:00:00Z');
  });

  it.each([undefined, null, 59, 2592001, 1.5])('requires a bounded explicit manual duration: %s', async (duration) => {
    expect((await owner.post('/api/cases', { ...payload, refusalWindowSeconds: duration })).status).toBe(422);
  });
  it('rejects refusal configuration on random cases', async () => {
    expect((await owner.post('/api/cases', { ...payload, selectionMethod: 'random' })).status).toBe(422);
  });
  it('silently opens voting at the logical cutoff and gives every seat the full window', async () => {
    const id = await create();
    await draw(id);
    expect((await jurors[0].post(`${path(id)}/vote`, { outcomeIndex: 0 })).status).toBe(409);
    now = new Date('2030-01-01T00:01:00Z');
    expect((await jurors[0].post(`${path(id)}/refuse`, {})).status).toBe(409);
    const detail = (await owner.get(path(id))).body;
    expect(detail.status).toBe('voting');
    expect(detail.jurors.map((j: { deadline: string }) => j.deadline)).toEqual(
      Array(3).fill('2030-01-01T00:03:00.000Z'),
    );
    for (const juror of jurors.slice(0, 3))
      expect((await juror.post(`${path(id)}/vote`, { outcomeIndex: 0 })).status).toBe(200);
    expect((await owner.get(path(id))).body.result).toBe('A');
  });
  it('preserves chains, removes access and excludes all prior jurors from replacements', async () => {
    const id = await create();
    const first = await draw(id);
    now = new Date('2030-01-01T00:00:59.999Z');
    expect((await jurors[0].post(`${path(id)}/refuse`, {})).status).toBe(200);
    expect((await jurors[0].get(path(id))).status).toBe(404);
    expect((await jurors[0].post(`${path(id)}/vote`, { outcomeIndex: 0 })).status).toBe(404);
    expect((await owner.get(`${path(id)}/eligible-jurors`)).body.map((j: { jurorId: number }) => j.jurorId)).toEqual(
      ids.slice(3),
    );
    expect((await owner.post(`${path(id)}/replace`, { position: 1, jurorId: ids[3] })).status).toBe(409);
    expect((await owner.post(`${path(id)}/replace`, { position: 0, jurorId: ids[0] })).status).toBe(422);
    expect((await owner.post(`${path(id)}/replace`, { position: 0, jurorId: ids[3] })).status).toBe(200);
    expect((await jurors[3].post(`${path(id)}/refuse`, {})).status).toBe(200);
    now = new Date('2030-01-01T00:02:00Z');
    const replacement = await admin.post(`${path(id)}/replace`, { position: 0, jurorId: ids[4] });
    expect(replacement.status).toBe(200);
    const history = replacement.body.assignmentHistory;
    expect(history).toHaveLength(5);
    expect(history[3].predecessorId).toBe(first.assignmentHistory[0].id);
    expect(history[4].predecessorId).toBe(history[3].id);
    expect(history[4]).toMatchObject({
      position: 0,
      jurorId: ids[4],
      refusedAt: null,
      refusalDeadline: '2030-01-01T00:03:00.000Z',
    });
    expect(history[4].selectedById).toBe(
      (await app.dataSource.getRepository(User).findOneByOrFail({ email: 'admin@example.com' })).id,
    );
    expect((await jurors[1].get(path(id))).body.assignmentHistory).toEqual(history);
    now = new Date('2030-01-01T00:03:00Z');
    const detail = (await owner.get(path(id))).body;
    expect(detail.status).toBe('voting');
    expect(detail.jurors).toHaveLength(3);
    expect(detail.jurors.every((j: { deadline: string }) => j.deadline === '2030-01-01T00:05:00.000Z')).toBe(true);
    for (const i of [1, 2, 4]) expect((await jurors[i].post(`${path(id)}/vote`, { outcomeIndex: 1 })).status).toBe(200);
    expect((await owner.get(path(id))).body.result).toBe('B');
  });
  it('waits indefinitely for multiple vacancies and an exhausted pool; expired individual windows stay closed', async () => {
    const id = await create({ panelSize: 5 });
    await draw(id, ids);
    for (const i of [0, 1]) expect((await jurors[i].post(`${path(id)}/refuse`, {})).status).toBe(200);
    now = new Date('2031-01-01T00:00:00Z');
    expect((await owner.get(path(id))).body.status).toBe('refusal');
    expect((await owner.get(`${path(id)}/eligible-jurors`)).body).toEqual([]);
    expect((await jurors[2].post(`${path(id)}/refuse`, {})).status).toBe(409);
  });
  it('settles late reads without extending voting', async () => {
    const id = await create();
    await draw(id);
    now = new Date('2030-01-01T00:10:00Z');
    const list = (await owner.get('/api/cases')).body;
    expect(list.find((c: { id: number }) => c.id === id)).toMatchObject({ status: 'resolved', result: null });
  });
  it('protects active roles, releases historical roles and retains independent owner access', async () => {
    const user = await app.dataSource.getRepository(User).findOneByOrFail({ email: 'creator1@example.com' });
    await app.dataSource.getRepository(User).update(user.id, { isJuror: true });
    const id = await create({ panelSize: 1 });
    await draw(id, [user.id]);
    expect((await admin.put(`/api/admin/users/${user.id}/roles`, { roles: ['creator'] })).status).toBe(409);
    expect((await owner.post(`${path(id)}/refuse`, {})).status).toBe(200);
    expect((await owner.get(path(id))).status).toBe(200);
    expect((await owner.post(`${path(id)}/vote`, { outcomeIndex: 0 })).status).toBe(403);
    expect((await admin.put(`/api/admin/users/${user.id}/roles`, { roles: ['creator'] })).status).toBe(200);
    expect((await owner.post(`${path(id)}/replace`, { position: 0, jurorId: ids[0] })).status).toBe(200);
  });
  it('enforces authentication, CSRF, visibility, ownership and strict request bodies', async () => {
    const id = await create();
    await draw(id);
    const outsider = await new Browser(app).login('user@example.com');
    for (const suffix of ['refuse', 'replace']) {
      expect((await new Browser(app).post(`${path(id)}/${suffix}`, { bad: true })).status).toBe(401);
      expect((await outsider.post(`${path(id)}/${suffix}`, {}, { csrf: false })).status).toBe(403);
      expect((await owner.post(`${path(id)}/${suffix}`, {}, { csrf: false })).status).toBe(403);
    }
    expect((await outsider.post(`${path(id)}/refuse`, {})).status).toBe(404);
    expect((await outsider.post(`${path(id)}/replace`, {})).status).toBe(403);
    expect((await owner.post(`${path(id)}/refuse`, { bad: true })).status).toBe(403);
    expect((await jurors[0].post(`${path(id)}/refuse`, { bad: true })).status).toBe(422);
    expect((await owner.post(`${path(id)}/replace`, {})).status).toBe(422);
    expect((await admin.post('/api/cases/999999/replace', {})).status).toBe(404);
  });
  it('keeps stored legacy manual cases and random cases on the old lifecycle', async () => {
    const legacy = await app.dataSource.getRepository(Case).save({
      ...payload,
      refusalWindowSeconds: null,
      selectionMethod: 'manual' as const,
      creatorId: (await app.dataSource.getRepository(User).findOneByOrFail({ email: 'creator1@example.com' })).id,
    });
    const res = await owner.post(`${path(legacy.id)}/draw`, { jurorIds: ids.slice(0, 3) });
    expect(res.body.case.status).toBe('voting');
    const id = await create({ selectionMethod: 'random', refusalWindowSeconds: undefined });
    expect((await owner.post(`${path(id)}/draw`)).body.case.status).toBe('voting');
  });
});
