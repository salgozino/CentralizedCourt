import { Client } from '../src/client';

/**
 * The EXPERIMENT.md acceptance check over HTTP only: a creator opens a case with 3 randomly drawn jurors, 2 of the
 * 3 vote "A" and the case becomes "Resolved: A". The deadline path needs the injected clock and lives in
 * backend/test/vote.spec.ts.
 */
describe('acceptance: one case end to end', () => {
  it('resolves "A" when 2 of 3 randomly drawn jurors vote A', async () => {
    const creator = await new Client().login('creator1@example.com');
    const created = await creator.post('/api/cases', {
      title: 'Acceptance dispute',
      description: 'Who keeps the deposit.',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 2 * 60 * 60,
    });
    expect(created.status).toBe(201);
    const draw = await creator.post(`/api/cases/${created.body.id}/draw`);
    expect(draw.status).toBe(200);
    expect(draw.body.jurors).toHaveLength(3);

    // Seeded jurors are "Juror N" <jurorN@example.com>; the API never exposes emails.
    const emails = draw.body.jurors.map(
      (j: { name: string }) => `${j.name.replace(' ', '').toLowerCase()}@example.com`,
    );
    const choices = [0, 0, 1];
    let last;
    for (const [i, email] of emails.entries()) {
      const juror = await new Client().login(email);
      last = await juror.post(`/api/cases/${created.body.id}/vote`, { outcomeIndex: choices[i] });
      expect(last.status).toBe(200);
    }
    expect(last!.body).toMatchObject({ status: 'resolved', result: 'A' });

    const seen = await creator.get(`/api/cases/${created.body.id}`);
    expect(seen.body).toMatchObject({ status: 'resolved', result: 'A' });
    expect(seen.body.jurors.map((j: { outcomeIndex: number }) => j.outcomeIndex)).toEqual(choices);
  });

  it('keeps cases away from non-creators and juror seats away from non-jurors', async () => {
    const plain = await new Client().login('user@example.com');
    const denied = await plain.post('/api/cases', {
      title: 'Not allowed',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 120,
    });
    expect(denied.status).toBe(403);

    const admin = await new Client().login('admin@example.com');
    const users = (await admin.get('/api/admin/users')).body as { email: string; id: number }[];
    const id = (email: string) => users.find((u) => u.email === email)!.id;
    const creator = await new Client().login('creator1@example.com');
    const manual = await creator.post('/api/cases', {
      title: 'Manual seats',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 120,
      selectionMethod: 'manual',
    });
    const seated = await creator.post(`/api/cases/${manual.body.id}/draw`, {
      jurorIds: [id('juror1@example.com'), id('juror2@example.com'), id('user@example.com')],
    });
    expect(seated.status).toBe(422);
  });

  it('enforces the vote guards and the final-vote rule', async () => {
    const creator = await new Client().login('creator1@example.com');
    const created = await creator.post('/api/cases', {
      title: 'Guarded vote',
      description: 'Details',
      outcomes: ['A', 'B'],
      voteWindowSeconds: 120,
    });
    const draw = await creator.post(`/api/cases/${created.body.id}/draw`);
    const path = `/api/cases/${created.body.id}/vote`;
    const email = `${draw.body.jurors[0].name.replace(' ', '').toLowerCase()}@example.com`;
    const juror = await new Client().login(email);

    expect((await new Client().post(path, { outcomeIndex: 0 })).status).toBe(401);
    expect((await juror.post(path, { outcomeIndex: 0 }, { csrf: false })).status).toBe(403);
    expect((await creator.post(path, { outcomeIndex: 0 })).body).toEqual({ detail: 'Only drawn jurors can vote' });
    expect((await juror.post(path, { outcomeIndex: 5 })).status).toBe(422);
    expect((await juror.post('/api/cases/999999/vote', { outcomeIndex: 0 })).status).toBe(404);

    const first = await juror.post(path, { outcomeIndex: 1 });
    expect(first.status).toBe(200);
    expect(first.body.jurors[0]).toMatchObject({ hasVoted: true, outcomeIndex: 1 });
    expect((await creator.get(`/api/cases/${created.body.id}`)).body.jurors[0]).toMatchObject({
      hasVoted: true,
      outcomeIndex: null,
    });
    const again = await juror.post(path, { outcomeIndex: 0 });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ detail: 'You have already voted' });
  });
});
