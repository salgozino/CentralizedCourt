import { Client } from '../src/client';

const input = {
  title: 'Refusal contract',
  description: 'Conflict',
  outcomes: ['A', 'B'],
  voteWindowSeconds: 120,
  panelSize: 1,
  selectionMethod: 'manual',
  refusalWindowSeconds: 86400,
};

it('preserves a refusal and linked replacement while enforcing access and guard order', async () => {
  const owner = await new Client().login('creator1@example.com');
  const admin = await new Client().login('admin@example.com');
  const juror = await new Client().login('juror1@example.com');
  const outsider = await new Client().login('user@example.com');
  const users = (await admin.get('/api/admin/users')).body;
  const idOf = (email: string) => users.find((u: { email: string }) => u.email === email).id;
  const created = await owner.post('/api/cases', input);
  expect(created.status).toBe(201);
  const path = `/api/cases/${created.body.id}`;
  const drawn = await owner.post(`${path}/draw`, { jurorIds: [idOf('juror1@example.com')] });
  expect(drawn.body.case.status).toBe('refusal');
  for (const endpoint of ['refuse', 'replace']) {
    expect((await new Client().post(`${path}/${endpoint}`, { invalid: true })).status).toBe(401);
    for (const caller of [owner, outsider]) {
      const res = await caller.post(`${path}/${endpoint}`, { invalid: true }, { csrf: false });
      expect(res.status).toBe(403);
      expect(res.body.detail).toBe('CSRF check Failed');
    }
  }
  expect((await outsider.post(`${path}/refuse`, {})).status).toBe(404);
  expect((await juror.post(`${path}/replace`, {})).status).toBe(403);
  expect((await owner.post(`${path}/refuse`, {})).status).toBe(403);
  expect((await juror.post(`${path}/refuse`, { invalid: true })).status).toBe(422);
  expect((await admin.post(`${path}/replace`, {})).status).toBe(422);
  expect((await juror.post(`${path}/refuse`, {})).status).toBe(200);
  expect((await juror.get(path)).status).toBe(404);
  expect((await juror.post(`${path}/refuse`, {})).status).toBe(404);
  expect(
    (await owner.get(`${path}/eligible-jurors`)).body.some(
      (j: { jurorId: number }) => j.jurorId === idOf('juror1@example.com'),
    ),
  ).toBe(false);
  const replaced = await admin.post(`${path}/replace`, { position: 0, jurorId: idOf('juror2@example.com') });
  expect(replaced.status).toBe(200);
  expect(replaced.body.assignmentHistory).toHaveLength(2);
  expect(replaced.body.assignmentHistory[0].refusedAt).toEqual(expect.any(String));
  expect(replaced.body.assignmentHistory[1]).toMatchObject({
    predecessorId: drawn.body.case.assignmentHistory[0].id,
    selectedById: idOf('admin@example.com'),
    jurorId: idOf('juror2@example.com'),
    refusedAt: null,
  });
  expect(JSON.stringify(replaced.body)).not.toContain('@example.com');
});
