import { Client } from '../src/client';

const payload = {
  title: 'Draw dispute',
  description: 'Who gets the refund.',
  outcomes: ['Refund', 'No refund'],
  voteWindowSeconds: 300,
};

async function userIds(): Promise<Record<string, number>> {
  const admin = await new Client().login('admin@example.com');
  const res = await admin.get('/api/admin/users');
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.map((u: { email: string; id: number }) => [u.email, u.id]));
}

describe('jury draw contract', () => {
  it('lets the creator draw a random panel once; the case moves to voting', async () => {
    const owner = await new Client().login('creator1@example.com');
    const created = await owner.post('/api/cases', payload);
    expect(created.status).toBe(201);
    const res = await owner.post(`/api/cases/${created.body.id}/draw`);
    expect(res.status).toBe(200);
    expect(res.body.case).toEqual({
      ...created.body,
      status: 'voting',
      updatedAt: expect.any(String),
      jurors: res.body.jurors,
    });
    expect(res.body.jurors).toHaveLength(3);
    for (const juror of res.body.jurors) {
      expect(juror).toEqual({
        jurorId: expect.any(Number),
        name: expect.stringMatching(/^Juror \d$/),
        drawnAt: expect.any(String),
        deadline: expect.any(String),
        hasVoted: false,
        outcomeIndex: null,
      });
      expect(Date.parse(juror.deadline) - Date.parse(juror.drawnAt)).toBe(300 * 1000);
    }
    expect((await owner.get(`/api/cases/${created.body.id}`)).body.status).toBe('voting');
    expect((await owner.post(`/api/cases/${created.body.id}/draw`)).status).toBe(409);
  });

  it('enforces session, CSRF, ownership and the juror pool size', async () => {
    const owner = await new Client().login('creator1@example.com');
    const created = await owner.post('/api/cases', payload);
    const path = `/api/cases/${created.body.id}/draw`;
    expect((await new Client().post(path)).status).toBe(401);
    expect((await owner.post(path, undefined, { csrf: false })).status).toBe(403);
    expect((await (await new Client().login('creator2@example.com')).post(path)).status).toBe(403);
    expect((await owner.post('/api/cases/999999/draw')).status).toBe(404);
    const big = await owner.post('/api/cases', { ...payload, panelSize: 11 });
    expect((await owner.post(`/api/cases/${big.body.id}/draw`)).status).toBe(409);
  });

  it('lists eligible jurors (id and name, no email) only to whoever can draw', async () => {
    const owner = await new Client().login('creator1@example.com');
    const created = await owner.post('/api/cases', { ...payload, refusalWindowSeconds: 60, selectionMethod: 'manual' });
    const path = `/api/cases/${created.body.id}/eligible-jurors`;
    const listed = await owner.get(path);
    expect(listed.status).toBe(200);
    for (const juror of listed.body) {
      expect(juror).toEqual({ jurorId: expect.any(Number), name: expect.stringMatching(/^Juror \d$/) });
    }
    expect(listed.body.length).toBeGreaterThanOrEqual(3);
    expect((await new Client().get(path)).status).toBe(401);
    expect((await (await new Client().login('creator2@example.com')).get(path)).status).toBe(403);
    expect((await owner.get('/api/cases/999999/eligible-jurors')).status).toBe(404);

    const jurorIds = listed.body.slice(0, 3).map((j: { jurorId: number }) => j.jurorId);
    const draw = await owner.post(`/api/cases/${created.body.id}/draw`, { jurorIds });
    expect(draw.status).toBe(200);
  });

  it('manual assignment only accepts users with the juror role', async () => {
    const ids = await userIds();
    const owner = await new Client().login('creator1@example.com');
    const manual = { ...payload, refusalWindowSeconds: 60, selectionMethod: 'manual' };
    const rejected = await owner.post('/api/cases', manual);
    const bad = await owner.post(`/api/cases/${rejected.body.id}/draw`, {
      jurorIds: [ids['juror1@example.com'], ids['juror2@example.com'], ids['user@example.com']],
    });
    expect(bad.status).toBe(422);
    const accepted = await owner.post('/api/cases', manual);
    const jurorIds = [ids['juror3@example.com'], ids['juror1@example.com'], ids['juror2@example.com']];
    const good = await owner.post(`/api/cases/${accepted.body.id}/draw`, { jurorIds });
    expect(good.status).toBe(200);
    expect(good.body.jurors.map((j: { jurorId: number }) => j.jurorId)).toEqual(jurorIds);
  });
});
