import { User } from '../src/entities';
import { Browser, BootedApp, bootApp } from './helpers';

const rolesUrl = (id: number) => `/api/admin/users/${id}/roles`;

describe('admin users over HTTP', () => {
  let booted: BootedApp;
  let ids: Record<string, number>;
  const idOf = (email: string) => ids[email];
  const admin = () => new Browser(booted).login('admin@example.com');

  beforeAll(async () => {
    booted = await bootApp();
    const users = await booted.dataSource.getRepository(User).find();
    ids = Object.fromEntries(users.map((u) => [u.email, u.id]));
  });
  afterAll(() => booted.close());

  it('lists users ordered by id', async () => {
    const res = await (await admin()).get('/api/admin/users');
    expect(res.status).toBe(200);
    const listed = res.body.map((u: { id: number }) => u.id);
    expect(listed).toEqual([...listed].sort((a: number, b: number) => a - b));
    expect(res.body).toHaveLength(9);
  });

  it('persists extra roles and keeps the admin flag', async () => {
    const id = idOf('admin@example.com');
    const res = await (await admin()).put(rolesUrl(id), { roles: ['juror'] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['admin', 'juror', 'user']);
    const row = await booted.dataSource.getRepository(User).findOneByOrFail({ id });
    expect(row).toMatchObject({ isAdmin: true, isCreator: false, isJuror: true });
  });

  it('dedupes roles and replaces the previous set', async () => {
    const id = idOf('juror1@example.com');
    const res = await (await admin()).put(rolesUrl(id), { roles: ['creator', 'creator'] });
    expect(res.body).toEqual({ id, email: 'juror1@example.com', roles: ['creator', 'user'] });
    const row = await booted.dataSource.getRepository(User).findOneByOrFail({ id });
    expect(row).toMatchObject({ isCreator: true, isJuror: false });
  });

  it('checks CSRF before the admin role', async () => {
    const user = await new Browser(booted).login('user@example.com');
    const res = await user.put(rolesUrl(idOf('user@example.com')), { roles: [] }, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('CSRF');
  });

  it('answers 403 for a non-admin before validating the body', async () => {
    const user = await new Browser(booted).login('user@example.com');
    const res = await user.put(rolesUrl(idOf('user@example.com')), { roles: ['admin'] });
    expect(res.body).toEqual({ detail: 'Admin role required' });
  });

  it('answers 422 for a non-numeric user id and 404 for an unknown one', async () => {
    const b = await admin();
    expect((await b.put('/api/admin/users/abc/roles', { roles: [] })).status).toBe(422);
    expect((await b.put(rolesUrl(999999), { roles: [] })).body).toEqual({ detail: 'Not Found' });
    expect((await b.put(rolesUrl(-1), { roles: [] })).status).toBe(404);
  });
});
