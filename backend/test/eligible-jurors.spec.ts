import { User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const payload = {
  title: 'Manual dispute',
  description: 'Details',
  outcomes: ['A', 'B'],
  voteWindowSeconds: 120,
  refusalWindowSeconds: 60,
  selectionMethod: 'manual',
};

describe('eligible jurors over HTTP', () => {
  let booted: BootedApp;
  let owner: Browser;
  let admin: Browser;
  let caseId: number;
  const users = () => booted.dataSource.getRepository(User);
  const url = (id: number | string) => `/api/cases/${id}/eligible-jurors`;
  const seededJurors = async () =>
    (await users().find({ order: { id: 'ASC' } }))
      .filter((u) => u.isJuror && u.isActive && !u.isAdmin)
      .map((u) => ({ jurorId: u.id, name: u.name }));

  beforeAll(async () => {
    booted = await bootApp();
    owner = await new Browser(booted).login('creator1@example.com');
    admin = await new Browser(booted).login('admin@example.com');
    caseId = (await owner.post('/api/cases', payload)).body.id;
  });
  afterAll(() => booted.close());

  it('requires a session', async () => {
    const res = await new Browser(booted).get(url(caseId));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ detail: 'Unauthorized' });
  });

  it.each(['999999', 'abc', '0'])('returns 404 for missing or invalid case %s', async (id) => {
    const res = await admin.get(url(id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ detail: 'Not Found' });
  });

  it.each(['creator2@example.com', 'juror1@example.com', 'user@example.com'])(
    'forbids %s, who cannot draw on this case',
    async (email) => {
      const res = await (await new Browser(booted).login(email)).get(url(caseId));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'Only the case creator or an admin can draw jurors' });
    },
  );

  it.each(['owner', 'admin'])('lists every eligible juror by id, name only, for the %s', async (who) => {
    const res = await (who === 'owner' ? owner : admin).get(url(caseId), { csrf: false, origin: null });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(await seededJurors());
    expect(res.body.map((j: { name: string }) => j.name)).toEqual([
      'Juror 1',
      'Juror 2',
      'Juror 3',
      'Juror 4',
      'Juror 5',
    ]);
    for (const juror of res.body) expect(Object.keys(juror).sort()).toEqual(['jurorId', 'name']);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('leaves out admins with the juror flag, inactive jurors and users without the juror role', async () => {
    const adminUser = await users().findOneByOrFail({ email: 'admin@example.com' });
    const juror2 = await users().findOneByOrFail({ email: 'juror2@example.com' });
    await users().update(adminUser.id, { isJuror: true });
    await users().update(juror2.id, { isActive: false });
    try {
      const names = (await owner.get(url(caseId))).body.map((j: { name: string }) => j.name);
      expect(names).toEqual(['Juror 1', 'Juror 3', 'Juror 4', 'Juror 5']);
    } finally {
      await users().update(adminUser.id, { isJuror: false });
      await users().update(juror2.id, { isActive: true });
    }
  });

  it('lists jurors that the manual draw then accepts, in the chosen order', async () => {
    const listed = (await owner.get(url(caseId))).body as { jurorId: number }[];
    const jurorIds = [listed[3].jurorId, listed[0].jurorId, listed[2].jurorId];
    const draw = await owner.post(`/api/cases/${caseId}/draw`, { jurorIds });
    expect(draw.status).toBe(200);
    expect(draw.body.jurors.map((j: { jurorId: number }) => j.jurorId)).toEqual(jurorIds);
  });
});
