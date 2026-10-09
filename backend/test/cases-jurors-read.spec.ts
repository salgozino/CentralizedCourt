import { Case, User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

describe('assigned case reads over HTTP', () => {
  let booted: BootedApp;
  let owner: Browser;
  let admin: Browser;
  let assigned: Browser;
  let caseId: number;
  let secondId: number;
  let jurorIds: number[];
  let panel: unknown[];

  beforeAll(async () => {
    booted = await bootApp();
    owner = await new Browser(booted).login('creator1@example.com');
    admin = await new Browser(booted).login('admin@example.com');
    assigned = await new Browser(booted).login('juror1@example.com');
    jurorIds = await Promise.all(
      ['juror3@example.com', 'juror1@example.com', 'juror2@example.com'].map(
        async (email) => (await booted.dataSource.getRepository(User).findOneByOrFail({ email })).id,
      ),
    );
    const payload = {
      title: 'Assigned dispute',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 120,
      selectionMethod: 'manual',
    };
    caseId = (await owner.post('/api/cases', payload)).body.id;
    secondId = (await owner.post('/api/cases', payload)).body.id;
    const draw = await owner.post(`/api/cases/${caseId}/draw`, { jurorIds });
    expect(draw.status).toBe(200);
    panel = draw.body.jurors;
  });
  afterAll(() => booted.close());

  it('returns an empty panel before drawing, without changing the list DTO', async () => {
    const detail = await owner.get(`/api/cases/${secondId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.jurors).toEqual([]);
    const list = await owner.get('/api/cases');
    for (const row of list.body) expect(row).not.toHaveProperty('jurors');
  });

  it('returns the full private-safe panel in position order to owner, admin and assigned jurors', async () => {
    for (const browser of [owner, admin, assigned, await new Browser(booted).login('juror2@example.com')]) {
      const res = await browser.get(`/api/cases/${caseId}`, { csrf: false, origin: null });
      expect(res.status).toBe(200);
      expect(res.body.jurors).toEqual(panel);
      expect(res.body.jurors).toEqual(
        jurorIds.map((jurorId, i) => ({
          jurorId,
          name: ['Juror 3', 'Juror 1', 'Juror 2'][i],
          drawnAt: expect.any(String),
          deadline: expect.any(String),
        })),
      );
      expect(JSON.stringify(res.body)).not.toContain('@example.com');
    }
  });

  it('lists assigned cases only, without exposing panels', async () => {
    const res = await assigned.get('/api/cases', { csrf: false, origin: null });
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([caseId]);
    expect(res.body[0]).not.toHaveProperty('jurors');
    expect((await assigned.get(`/api/cases/${secondId}`)).body).toEqual({ detail: 'Not Found' });
  });

  it.each(['creator2@example.com', 'juror4@example.com', 'user@example.com'])(
    'hides assigned cases from unrelated %s',
    async (email) => {
      const browser = await new Browser(booted).login(email);
      expect((await browser.get('/api/cases')).body).toEqual([]);
      const detail = await browser.get(`/api/cases/${caseId}`);
      expect(detail.status).toBe(404);
      expect(detail.body).toEqual({ detail: 'Not Found' });
    },
  );

  it('requires authentication even after assignment', async () => {
    const anon = new Browser(booted);
    for (const path of ['/api/cases', `/api/cases/${caseId}`]) {
      const res = await anon.get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ detail: 'Unauthorized' });
    }
  });

  it('does not duplicate an owned and assigned case and keeps list ordering', async () => {
    const users = booted.dataSource.getRepository(User);
    await users.update(jurorIds[1], { isCreator: true });
    const created = await assigned.post('/api/cases', {
      title: 'Owned and assigned',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 120,
      panelSize: 1,
      selectionMethod: 'manual',
    });
    expect(created.status).toBe(201);
    expect((await assigned.post(`/api/cases/${created.body.id}/draw`, { jurorIds: [jurorIds[1]] })).status).toBe(200);
    await booted.dataSource
      .getRepository(Case)
      .update([caseId, created.body.id], { createdAt: new Date('2026-01-01') });
    expect((await assigned.get('/api/cases')).body.map((c: { id: number }) => c.id)).toEqual([created.body.id, caseId]);
  });
});
