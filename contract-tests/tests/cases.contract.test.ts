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
      expect(detail.body).toEqual(created.body);
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
