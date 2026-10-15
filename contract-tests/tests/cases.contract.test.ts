import { Client } from '../src/client';

const payload = {
  title: 'Contract dispute',
  description: 'An undelivered order.',
  outcomes: ['Refund', 'No refund'],
  voteWindowSeconds: 120,
};

describe('cases create/list/detail contract', () => {
  it('creates a complete DTO, lists it for the owner and admin, and reads it back', async () => {
    const owner = await new Client().login('creator1@example.com');
    const created = await owner.post('/api/cases', payload);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      ...payload,
      refusalWindowSeconds: null,
      id: expect.any(Number),
      creatorId: expect.any(Number),
      panelSize: 3,
      selectionMethod: 'random',
      status: 'awaiting_jurors',
      result: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    for (const browser of [owner, await new Client().login('admin@example.com')]) {
      const list = await browser.get('/api/cases');
      expect(list.status).toBe(200);
      expect(list.body).toContainEqual(created.body);
      const detail = await browser.get(`/api/cases/${created.body.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body).toEqual({ ...created.body, jurors: [] });
    }
    for (const email of ['creator2@example.com', 'juror1@example.com', 'user@example.com']) {
      const browser = await new Client().login(email);
      const list = await browser.get('/api/cases');
      expect(list.status).toBe(200);
      expect(list.body).not.toContainEqual(created.body);
      const detail = await browser.get(`/api/cases/${created.body.id}`);
      expect(detail.status).toBe(404);
      expect(detail.body).toEqual({ detail: 'Not Found' });
    }
  });
  it('grants assigned jurors detail and list visibility, but exposes the panel only in detail/draw', async () => {
    const owner = await new Client().login('creator1@example.com');
    const admin = await new Client().login('admin@example.com');
    const users = await admin.get('/api/admin/users');
    const ids = Object.fromEntries(users.body.map((u: { email: string; id: number }) => [u.email, u.id]));
    const created = await owner.post('/api/cases', { ...payload, refusalWindowSeconds: 60, selectionMethod: 'manual' });
    const id = created.body.id;
    const jurorIds = [ids['juror3@example.com'], ids['juror1@example.com'], ids['juror2@example.com']];
    const draw = await owner.post(`/api/cases/${id}/draw`, { jurorIds });
    expect(draw.status).toBe(200);
    expect(draw.body.jurors).toEqual(
      jurorIds.map((jurorId, i) => ({
        jurorId,
        name: ['Juror 3', 'Juror 1', 'Juror 2'][i],
        drawnAt: expect.any(String),
        deadline: expect.any(String),
        hasVoted: false,
        outcomeIndex: null,
      })),
    );
    for (const browser of [owner, admin, await new Client().login('juror1@example.com')]) {
      const detail = await browser.get(`/api/cases/${id}`, { csrf: false });
      expect(detail.status).toBe(200);
      expect(detail.body).toEqual(draw.body.case);
      expect(detail.body.jurors).toEqual(draw.body.jurors);
      const list = await browser.get('/api/cases', { csrf: false });
      expect(list.status).toBe(200);
      expect(list.body).toContainEqual(expect.objectContaining({ id }));
      for (const row of list.body) expect(row).not.toHaveProperty('jurors');
    }
    for (const email of ['creator2@example.com', 'juror4@example.com', 'user@example.com']) {
      const browser = await new Client().login(email);
      const detail = await browser.get(`/api/cases/${id}`);
      expect(detail.status).toBe(404);
      expect(detail.body).toEqual({ detail: 'Not Found' });
      expect((await browser.get('/api/cases')).body).not.toContainEqual(expect.objectContaining({ id }));
    }
  });

  it('requires session authentication on reads and creation', async () => {
    const browser = new Client();
    expect((await browser.get('/api/cases')).status).toBe(401);
    expect((await browser.get('/api/cases/1')).status).toBe(401);
    expect((await browser.post('/api/cases', payload)).status).toBe(401);
  });
  it('enforces creator permission, CSRF and validation on creation', async () => {
    const plain = await new Client().login('user@example.com');
    expect((await plain.post('/api/cases', payload)).status).toBe(403);
    const owner = await new Client().login('creator1@example.com');
    expect((await owner.post('/api/cases', payload, { csrf: false })).status).toBe(403);
    expect((await owner.post('/api/cases', { ...payload, status: 'resolved' })).status).toBe(422);
  });
});
