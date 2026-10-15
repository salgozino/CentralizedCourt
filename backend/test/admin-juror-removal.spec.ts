import { User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const WINDOW_SECONDS = 120;
const START = new Date('2030-01-01T00:00:00.000Z');
const DEADLINE = new Date(START.getTime() + WINDOW_SECONDS * 1000);
const ACTIVE_CASE = 'Cannot remove the juror role while the user is on an active case';

describe('removing the juror role', () => {
  let booted: BootedApp;
  let now = START;
  let admin: Browser;
  let owner: Browser;
  const jurors: Record<string, Browser> = {};
  const ids: Record<string, number> = {};

  const rolesOf = async (email: string): Promise<string[]> => {
    const res = await admin.get('/api/admin/users');
    return res.body.find((u: { email: string }) => u.email === email).roles;
  };
  const setRoles = (email: string, roles: string[]) => admin.put(`/api/admin/users/${ids[email]}/roles`, { roles });
  /** A manual case seated with juror1..juror3 at the injected START time. */
  const drawnCase = async (): Promise<number> => {
    now = START;
    const created = await owner.post('/api/cases', {
      title: 'A dispute',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: WINDOW_SECONDS,
      selectionMethod: 'manual',
    });
    const jurorIds = ['juror1', 'juror2', 'juror3'].map((n) => ids[`${n}@example.com`]);
    expect((await owner.post(`/api/cases/${created.body.id}/draw`, { jurorIds })).status).toBe(200);
    return created.body.id;
  };
  const vote = (name: string, id: number, outcomeIndex = 0) =>
    jurors[name].post(`/api/cases/${id}/vote`, { outcomeIndex });

  beforeAll(async () => {
    booted = await bootApp({ overrides: [{ provide: 'CLOCK', useValue: () => now }] });
    for (const u of await booted.dataSource.getRepository(User).find()) ids[u.email] = u.id;
    admin = await new Browser(booted).login('admin@example.com');
    owner = await new Browser(booted).login('creator1@example.com');
    for (const name of ['juror1', 'juror2', 'juror3']) {
      jurors[name] = await new Browser(booted).login(`${name}@example.com`);
    }
  });
  /** Each test starts with no active case and the seeded juror roles. */
  afterEach(async () => {
    now = new Date(DEADLINE.getTime() + 24 * 60 * 60 * 1000);
    expect((await owner.get('/api/cases')).status).toBe(200); // settles every expired case
    const users = booted.dataSource.getRepository(User);
    for (const n of [1, 2, 3, 4]) await users.update(ids[`juror${n}@example.com`], { isJuror: true, isCreator: false });
  });
  afterAll(() => booted.close());

  it('answers 409 and changes nothing while the juror is on a case that is voting', async () => {
    await drawnCase();
    for (const roles of [[], ['creator']]) {
      const res = await setRoles('juror1@example.com', roles);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ detail: ACTIVE_CASE });
      expect(await rolesOf('juror1@example.com')).toEqual(['juror', 'user']);
    }
  });

  it('still answers 409 after the juror voted, while the case is voting', async () => {
    const id = await drawnCase();
    expect((await vote('juror1', id)).status).toBe(200);
    const res = await setRoles('juror1@example.com', []);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ detail: ACTIVE_CASE });
  });

  it('lets the admin add roles to a juror on an active case, keeping the juror role', async () => {
    await drawnCase();
    const res = await setRoles('juror1@example.com', ['creator', 'juror']);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['creator', 'juror', 'user']);
  });

  it('removes the juror role once every active case is resolved', async () => {
    const id = await drawnCase();
    for (const name of ['juror1', 'juror2', 'juror3']) expect((await vote(name, id)).status).toBe(200);
    const res = await setRoles('juror1@example.com', []);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['user']);
    expect(await rolesOf('juror1@example.com')).toEqual(['user']);
  });

  it('settles a case whose deadline passed before checking, so it does not block', async () => {
    const id = await drawnCase();
    now = DEADLINE;
    const res = await setRoles('juror2@example.com', []);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['user']);
    expect((await owner.get(`/api/cases/${id}`)).body).toMatchObject({ status: 'resolved', result: null });
  });

  it('removes the juror role from a juror who was never drawn', async () => {
    await drawnCase();
    const res = await setRoles('juror4@example.com', []);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['user']);
  });

  it('does not restrict removing the creator role from a creator who is also an active juror', async () => {
    await drawnCase();
    expect((await setRoles('juror1@example.com', ['creator', 'juror'])).status).toBe(200);
    const res = await setRoles('juror1@example.com', ['juror']);
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['juror', 'user']);
  });
});
