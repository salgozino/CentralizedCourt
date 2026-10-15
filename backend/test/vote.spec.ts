import { Case, User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const WINDOW_SECONDS = 120;
const START = new Date('2030-01-01T00:00:00.000Z');
const DEADLINE = new Date(START.getTime() + WINDOW_SECONDS * 1000);

interface JurorOut {
  jurorId: number;
  name: string;
  drawnAt: string;
  deadline: string;
  hasVoted: boolean;
  outcomeIndex: number | null;
}

describe('voting and resolution over HTTP', () => {
  let booted: BootedApp;
  let now = START;
  let owner: Browser;
  let admin: Browser;
  const jurors: Record<string, Browser> = {};
  const ids: Record<string, number> = {};
  const users = () => booted.dataSource.getRepository(User);

  /** A manual case seated with juror1..juror3 (in that order) at the injected START time. */
  const drawnCase = async (outcomes = ['A', 'B']): Promise<number> => {
    now = START;
    const created = await owner.post('/api/cases', {
      title: 'A dispute',
      description: 'Details',
      outcomes,
      voteWindowSeconds: WINDOW_SECONDS,
      refusalWindowSeconds: 60,
      selectionMethod: 'manual',
    });
    expect(created.status).toBe(201);
    // Legacy stored manual cases keep immediate voting.
    await booted.dataSource.getRepository(Case).update(created.body.id, { refusalWindowSeconds: null });
    const draw = await owner.post(`/api/cases/${created.body.id}/draw`, {
      jurorIds: [ids.juror1, ids.juror2, ids.juror3],
    });
    expect(draw.status).toBe(200);
    return created.body.id;
  };
  const vote = (browser: Browser, id: number | string, body: unknown, opts = {}) =>
    browser.post(`/api/cases/${id}/vote`, body, opts);
  /** Each panel juror's own vote, as that juror reads it through the API (null = not voted). */
  const storedVotes = async (caseId: number) => {
    const seen: (number | null)[] = [];
    for (const [position, name] of ['juror1', 'juror2', 'juror3'].entries()) {
      const own = (await detail(jurors[name], caseId)).jurors[position] as JurorOut;
      expect(own.jurorId).toBe(ids[name]);
      expect(own.hasVoted).toBe(own.outcomeIndex !== null);
      seen.push(own.outcomeIndex);
    }
    return seen;
  };
  const detail = async (browser: Browser, id: number) => {
    const res = await browser.get(`/api/cases/${id}`);
    expect(res.status).toBe(200);
    return res.body;
  };

  beforeAll(async () => {
    booted = await bootApp({ overrides: [{ provide: 'CLOCK', useValue: () => now }] });
    owner = await new Browser(booted).login('creator1@example.com');
    admin = await new Browser(booted).login('admin@example.com');
    for (const name of ['juror1', 'juror2', 'juror3', 'juror4']) {
      jurors[name] = await new Browser(booted).login(`${name}@example.com`);
      ids[name] = (await users().findOneByOrFail({ email: `${name}@example.com` })).id;
    }
  });
  afterAll(() => booted.close());

  describe('guards', () => {
    it('requires a session and CSRF', async () => {
      const id = await drawnCase();
      const anon = await vote(new Browser(booted), id, { outcomeIndex: 0 });
      expect(anon.status).toBe(401);
      expect(anon.body).toEqual({ detail: 'Unauthorized' });
      const res = await vote(jurors.juror1, id, { outcomeIndex: 0 }, { csrf: false });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'CSRF check Failed' });
      expect(await storedVotes(id)).toEqual([null, null, null]);
    });

    it.each(['999999', 'abc', '0'])('returns 404 for missing or invalid case %s', async (id) => {
      const res = await vote(jurors.juror1, id, { outcomeIndex: 0 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ detail: 'Not Found' });
    });

    it.each(['creator2@example.com', 'juror4@example.com', 'user@example.com'])(
      'returns 404 to %s, who cannot read the case',
      async (email) => {
        const id = await drawnCase();
        const browser = email === 'juror4@example.com' ? jurors.juror4 : await new Browser(booted).login(email);
        const res = await vote(browser, id, { outcomeIndex: 0 });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ detail: 'Not Found' });
        expect(await storedVotes(id)).toEqual([null, null, null]);
      },
    );

    it.each(['owner', 'admin'])('forbids the %s, who can read but is not on the panel', async (who) => {
      const id = await drawnCase();
      const res = await vote(who === 'owner' ? owner : admin, id, { outcomeIndex: 0 });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ detail: 'Only drawn jurors can vote' });
      expect(await storedVotes(id)).toEqual([null, null, null]);
    });

    it.each([
      ['an empty body', {}],
      ['a string index', { outcomeIndex: '0' }],
      ['a fractional index', { outcomeIndex: 0.5 }],
      ['a negative index', { outcomeIndex: -1 }],
      ['an unknown field', { outcomeIndex: 0, outcome: 'A' }],
    ])('rejects %s with 422 and stores nothing', async (_label, body) => {
      const id = await drawnCase();
      const res = await vote(jurors.juror1, id, body);
      expect(res.status).toBe(422);
      expect(await storedVotes(id)).toEqual([null, null, null]);
    });

    it('rejects an index outside the outcomes with 422', async () => {
      const id = await drawnCase();
      const res = await vote(jurors.juror1, id, { outcomeIndex: 2 });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ detail: 'outcomeIndex must refer to one of the case outcomes' });
      expect(await storedVotes(id)).toEqual([null, null, null]);
    });

    it('lets a drawn juror vote after losing the juror role: assignment grants the vote', async () => {
      const id = await drawnCase();
      await users().update(ids.juror1, { isJuror: false });
      try {
        expect((await vote(jurors.juror1, id, { outcomeIndex: 1 })).status).toBe(200);
      } finally {
        await users().update(ids.juror1, { isJuror: true });
      }
    });
  });

  describe('casting a vote', () => {
    it('stores the vote and shows only who voted; each juror sees their own choice', async () => {
      const id = await drawnCase();
      const res = await vote(jurors.juror1, id, { outcomeIndex: 1 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('voting');
      expect(res.body.result).toBeNull();
      expect(res.body.jurors.map((j: JurorOut) => [j.jurorId, j.hasVoted, j.outcomeIndex])).toEqual([
        [ids.juror1, true, 1],
        [ids.juror2, false, null],
        [ids.juror3, false, null],
      ]);
      for (const browser of [owner, admin, jurors.juror2]) {
        const seen = (await detail(browser, id)).jurors as JurorOut[];
        expect(seen.map((j) => [j.hasVoted, j.outcomeIndex])).toEqual([
          [true, null],
          [false, null],
          [false, null],
        ]);
      }
      expect((await detail(jurors.juror1, id)).jurors[0]).toMatchObject({ hasVoted: true, outcomeIndex: 1 });
      expect(await storedVotes(id)).toEqual([1, null, null]);
    });

    it('accepts a vote 1 ms before the deadline and rejects one at the deadline', async () => {
      const id = await drawnCase();
      now = new Date(DEADLINE.getTime() - 1);
      expect((await vote(jurors.juror1, id, { outcomeIndex: 0 })).status).toBe(200);
      now = DEADLINE;
      const late = await vote(jurors.juror2, id, { outcomeIndex: 1 });
      expect(late.status).toBe(409);
      expect(late.body).toEqual({ detail: 'The voting deadline has passed' });
      expect(await storedVotes(id)).toEqual([0, null, null]);
    });

    it('treats the vote as final: a second vote answers 409 and changes nothing', async () => {
      const id = await drawnCase();
      expect((await vote(jurors.juror1, id, { outcomeIndex: 0 })).status).toBe(200);
      const again = await vote(jurors.juror1, id, { outcomeIndex: 1 });
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ detail: 'You have already voted' });
      expect(await storedVotes(id)).toEqual([0, null, null]);
    });

    it('rejects votes on a resolved case', async () => {
      const id = await drawnCase();
      for (const name of ['juror1', 'juror2', 'juror3']) await vote(jurors[name], id, { outcomeIndex: 0 });
      const res = await vote(jurors.juror1, id, { outcomeIndex: 1 });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ detail: 'Votes are only accepted while the case is voting' });
      expect(await storedVotes(id)).toEqual([0, 0, 0]);
    });

    it('starts with no votes in the draw output', async () => {
      now = START;
      const created = await owner.post('/api/cases', {
        title: 'Fresh',
        description: 'Details',
        outcomes: ['A', 'B'],
        voteWindowSeconds: WINDOW_SECONDS,
      });
      const draw = await owner.post(`/api/cases/${created.body.id}/draw`);
      expect(draw.status).toBe(200);
      for (const juror of draw.body.jurors as JurorOut[]) {
        expect(juror).toMatchObject({ hasVoted: false, outcomeIndex: null });
        expect(juror.drawnAt).toBe(START.toISOString());
        expect(juror.deadline).toBe(DEADLINE.toISOString());
      }
    });
  });

  describe('resolution', () => {
    it('waits for every juror: 2 of 3 votes keep the case voting before the deadline', async () => {
      const id = await drawnCase();
      await vote(jurors.juror1, id, { outcomeIndex: 0 });
      await vote(jurors.juror2, id, { outcomeIndex: 0 });
      now = new Date(DEADLINE.getTime() - 1);
      expect(await detail(owner, id)).toMatchObject({ status: 'voting', result: null });
    });

    it('resolves "A" when 2 of 3 jurors vote A before the deadline and the deadline passes', async () => {
      const id = await drawnCase();
      await vote(jurors.juror1, id, { outcomeIndex: 0 });
      await vote(jurors.juror2, id, { outcomeIndex: 0 });
      now = DEADLINE;
      const resolved = await detail(owner, id);
      expect(resolved).toMatchObject({ status: 'resolved', result: 'A' });
      expect(resolved.jurors.map((j: JurorOut) => [j.hasVoted, j.outcomeIndex])).toEqual([
        [true, 0],
        [true, 0],
        [false, null],
      ]);
      const late = await vote(jurors.juror3, id, { outcomeIndex: 1 });
      expect(late.status).toBe(409);
      expect(late.body).toEqual({ detail: 'The voting deadline has passed' });
      expect(await storedVotes(id)).toEqual([0, 0, null]);
    });

    it('resolves as soon as every juror voted and publishes every vote', async () => {
      const id = await drawnCase();
      await vote(jurors.juror1, id, { outcomeIndex: 0 });
      await vote(jurors.juror2, id, { outcomeIndex: 1 });
      const last = await vote(jurors.juror3, id, { outcomeIndex: 0 });
      expect(last.status).toBe(200);
      expect(last.body).toMatchObject({ status: 'resolved', result: 'A' });
      for (const browser of [owner, admin, jurors.juror2]) {
        const seen = await detail(browser, id);
        expect(seen.jurors.map((j: JurorOut) => j.outcomeIndex)).toEqual([0, 1, 0]);
      }
      const listed = (await owner.get('/api/cases')).body.find((c: { id: number }) => c.id === id);
      expect(listed).toMatchObject({ status: 'resolved', result: 'A' });
    });

    it('counts the majority over cast votes: one vote of three resolves at the deadline', async () => {
      const id = await drawnCase();
      await vote(jurors.juror2, id, { outcomeIndex: 1 });
      now = DEADLINE;
      expect(await detail(jurors.juror1, id)).toMatchObject({ status: 'resolved', result: 'B' });
    });

    it('resolves without a result when the cast votes are split', async () => {
      const id = await drawnCase(['A', 'B', 'C']);
      await vote(jurors.juror1, id, { outcomeIndex: 0 });
      await vote(jurors.juror2, id, { outcomeIndex: 1 });
      const last = await vote(jurors.juror3, id, { outcomeIndex: 2 });
      expect(last.body).toMatchObject({ status: 'resolved', result: null });
    });

    it('resolves without a result on a tie of cast votes at the deadline', async () => {
      const id = await drawnCase();
      await vote(jurors.juror1, id, { outcomeIndex: 0 });
      await vote(jurors.juror2, id, { outcomeIndex: 1 });
      now = DEADLINE;
      expect(await detail(owner, id)).toMatchObject({ status: 'resolved', result: null });
    });

    it('resolves without a result when nobody voted, also through the case list', async () => {
      const id = await drawnCase();
      now = DEADLINE;
      const listed = (await owner.get('/api/cases')).body.find((c: { id: number }) => c.id === id);
      expect(listed).toMatchObject({ status: 'resolved', result: null });
      expect(await detail(owner, id)).toMatchObject({ status: 'resolved', result: null });
    });
  });
});
