import { Case, User } from '../src/entities';

import { Browser, BootedApp, bootApp } from './helpers';

const validCase = {
  title: 'Refund dispute',
  description: 'The buyer says the item never arrived.',
  outcomes: ['Refund', 'No refund'],
  voteWindowSeconds: 120,
};

describe('create case over HTTP', () => {
  let booted: BootedApp;
  const as = (email: string) => new Browser(booted).login(email);

  beforeAll(async () => {
    booted = await bootApp();
  });
  afterAll(() => booted.close());

  it('creates a case for a creator with defaults and the initial status', async () => {
    const creator = await booted.dataSource.getRepository(User).findOneByOrFail({ email: 'creator1@example.com' });
    const res = await (await as('creator1@example.com')).post('/api/cases', validCase);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      creatorId: creator.id,
      ...validCase,
      panelSize: 3,
      selectionMethod: 'random',
      status: 'awaiting_jurors',
      result: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await booted.dataSource.getRepository(Case).findOneByOrFail({ id: res.body.id });
    expect(row).toMatchObject({ ...validCase, creatorId: creator.id, panelSize: 3, status: 'awaiting_jurors' });
  });

  it('accepts an explicit panel size and selection method, and trims text', async () => {
    const res = await (
      await as('creator2@example.com')
    ).post('/api/cases', {
      ...validCase,
      title: '  Padded title  ',
      outcomes: [' A ', 'B', 'C'],
      panelSize: 5,
      selectionMethod: 'manual',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Padded title', outcomes: ['A', 'B', 'C'], panelSize: 5 });
    expect(res.body.selectionMethod).toBe('manual');
  });

  it('lets an admin without the creator role create a case', async () => {
    const admin = await booted.dataSource.getRepository(User).findOneByOrFail({ email: 'admin@example.com' });
    expect(admin.isCreator).toBe(false);
    const res = await (await as('admin@example.com')).post('/api/cases', validCase);
    expect(res.status).toBe(201);
    expect(res.body.creatorId).toBe(admin.id);
  });

  it.each(['user@example.com', 'juror1@example.com'])('answers 403 for %s', async (email) => {
    const before = await booted.dataSource.getRepository(Case).count();
    const res = await (await as(email)).post('/api/cases', validCase);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ detail: 'Creator role required' });
    expect(await booted.dataSource.getRepository(Case).count()).toBe(before);
  });

  it('answers 401 for anonymous requests and 403 without CSRF', async () => {
    expect((await new Browser(booted).post('/api/cases', validCase)).status).toBe(401);
    const res = await (await as('creator1@example.com')).post('/api/cases', validCase, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('CSRF');
  });

  it('checks the creator role before validating the body', async () => {
    const res = await (await as('user@example.com')).post('/api/cases', { title: 1 });
    expect(res.status).toBe(403);
  });

  it('accepts every limit exactly', async () => {
    const creator = await as('creator1@example.com');
    const longest = {
      ...validCase,
      title: 't'.repeat(200),
      description: 'd'.repeat(5000),
      outcomes: Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(100, 'o')),
      voteWindowSeconds: 30 * 24 * 3600,
      panelSize: 11,
    };
    expect((await creator.post('/api/cases', longest)).status).toBe(201);
    const shortest = { ...validCase, title: 'abc', description: 'd', outcomes: ['A', 'B'], voteWindowSeconds: 60 };
    expect((await creator.post('/api/cases', { ...shortest, panelSize: 1 })).status).toBe(201);
  });

  it.each([
    ['missing title', { ...validCase, title: undefined }],
    ['title too long', { ...validCase, title: 't'.repeat(201) }],
    ['description too long', { ...validCase, description: 'd'.repeat(5001) }],
    ['outcome too long', { ...validCase, outcomes: ['A', 'b'.repeat(101)] }],
    ['zero panel', { ...validCase, panelSize: 0 }],
    ['negative panel', { ...validCase, panelSize: -1 }],
    ['short title', { ...validCase, title: ' ab ' }],
    ['blank description', { ...validCase, description: '   ' }],
    ['one outcome', { ...validCase, outcomes: ['Only'] }],
    ['eleven outcomes', { ...validCase, outcomes: Array.from({ length: 11 }, (_, i) => `O${i}`) }],
    ['blank outcome', { ...validCase, outcomes: ['A', '  '] }],
    ['duplicate outcomes ignoring case', { ...validCase, outcomes: ['Yes', 'yes '] }],
    ['window too short', { ...validCase, voteWindowSeconds: 59 }],
    ['window too long', { ...validCase, voteWindowSeconds: 30 * 24 * 3600 + 1 }],
    ['non-integer window', { ...validCase, voteWindowSeconds: 90.5 }],
    ['even panel', { ...validCase, panelSize: 4 }],
    ['panel too large', { ...validCase, panelSize: 13 }],
    ['unknown selection method', { ...validCase, selectionMethod: 'lottery' }],
    ['client-set status', { ...validCase, status: 'resolved' }],
    ['evidence (deferred)', { ...validCase, evidence: ['https://example.com/a.pdf'] }],
  ])('answers 422 for %s', async (_label, body) => {
    const res = await (await as('creator1@example.com')).post('/api/cases', body);
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.detail)).toBe(true);
  });

  it('keeps showing ownership after the creator role is removed', async () => {
    const users = booted.dataSource.getRepository(User);
    const creator = await users.findOneByOrFail({ email: 'creator2@example.com' });
    const res = await (await as('creator2@example.com')).post('/api/cases', validCase);
    await users.update(creator.id, { isCreator: false });
    const row = await booted.dataSource.getRepository(Case).findOneByOrFail({ id: res.body.id });
    expect(row.creatorId).toBe(creator.id);
    expect((await (await as('creator2@example.com')).post('/api/cases', validCase)).status).toBe(403);
    await users.update(creator.id, { isCreator: true });
  });
});
