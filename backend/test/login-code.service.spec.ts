import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

import { DataSource, MoreThan } from 'typeorm';

import {
  LOGIN_THROTTLE_WINDOW_MS,
  LoginCodeService,
  MAX_ATTEMPTS_PER_CODE,
  MAX_CODES_PER_SESSION,
  MAX_CODE_REQUESTS_PER_IP,
  MAX_FAILED_VERIFICATIONS_PER_IP,
  SESSION_CODE_IDS_KEY,
} from '../src/auth/login-code.service';
import { LoginCode, LoginEvent, User } from '../src/entities';
import { seedUsers } from '../src/seed/seed';
import { SessionStore } from '../src/session/session-store';

import { migratedDataSource, tempDbPath } from './helpers';

class MemorySession implements SessionStore {
  data: Record<string, unknown> = {};
  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }
  set(key: string, value: unknown): void {
    this.data[key] = value;
  }
}

const LINE_RE = /^LOGIN CODE (\S+) (\d{6})\n$/;
const JUROR1 = 'juror1@example.com';
const ADMIN = 'admin@example.com';

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('LoginCodeService', () => {
  const { dir, dbPath } = tempDbPath();
  let dataSource: DataSource;
  let service: LoginCodeService;
  let written: string[];

  const codes = () => dataSource.getRepository(LoginCode);
  const events = () => dataSource.getRepository(LoginEvent);

  beforeAll(async () => {
    dataSource = await migratedDataSource(dbPath);
    await seedUsers(dataSource);
    service = new LoginCodeService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await codes().clear();
    await events().clear();
    written = [];
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  /** Requests a code and returns the one printed to stdout, or null when none was printed. */
  async function requestCode(email: string, ip: string, session: SessionStore): Promise<string | null> {
    const before = written.length;
    await service.issue(email, ip, session);
    const line = written.slice(before).find((l) => l.startsWith('LOGIN CODE'));
    return line ? LINE_RE.exec(line)![2] : null;
  }

  describe('issue', () => {
    it('prints a single line, normalising the email, and stores only the sha256 hash', async () => {
      const code = await requestCode(' Juror1@Example.com ', '10.0.0.1', new MemorySession());
      expect(written).toHaveLength(1);
      const match = LINE_RE.exec(written[0]);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(JUROR1);
      const user = await dataSource.getRepository(User).findOneByOrFail({ email: JUROR1 });
      const stored = await codes().findOneByOrFail({ userId: user.id });
      expect(stored.codeHash).toHaveLength(64);
      expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.codeHash).not.toBe(code);
      expect(stored.codeHash).toBe(createHash('sha256').update(code!).digest('hex'));
      expect(await codes().count()).toBe(1);
    });

    it('expires a code after 10 minutes', async () => {
      const code = await requestCode(JUROR1, '10.0.0.1', new MemorySession());
      const stored = await codes().findOneByOrFail({});
      const ttl = stored.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(9 * 60_000);
      expect(ttl).toBeLessThanOrEqual(10 * 60_000);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('prints and stores nothing for an unknown email, but still counts the request', async () => {
      await requestCode('nobody@example.com', '10.0.0.7', new MemorySession());
      expect(written).toEqual([]);
      expect(await codes().count()).toBe(0);
      const stored = await events().find();
      expect(stored.map((e) => [e.ip, e.kind])).toEqual([['10.0.0.7', 'request']]);
    });

    it('records the throttle IP it was given', async () => {
      await requestCode(JUROR1, '10.0.0.66', new MemorySession());
      expect((await events().find()).map((e) => e.ip)).toEqual(['10.0.0.66']);
    });

    it('invalidates only the previous live codes of this session for that email', async () => {
      const mine = new MemorySession();
      const other = new MemorySession();
      const first = await requestCode(JUROR1, '10.0.0.1', mine);
      const theirs = await requestCode(JUROR1, '10.0.0.2', other);
      const second = await requestCode(JUROR1, '10.0.0.1', mine);
      expect(await service.verify(JUROR1, first!, '10.0.0.1', mine)).toBeNull();
      expect(await service.verify(JUROR1, second!, '10.0.0.1', mine)).not.toBeNull();
      expect(await service.verify(JUROR1, theirs!, '10.0.0.2', other)).not.toBeNull();
    });

    it(`keeps the last ${MAX_CODES_PER_SESSION} code ids in the session`, async () => {
      const session = new MemorySession();
      const ids: number[] = [];
      for (const email of [JUROR1, ADMIN, JUROR1, ADMIN, JUROR1, ADMIN, JUROR1]) {
        await requestCode(email, '10.0.0.1', session);
        ids.push((await codes().find({ order: { id: 'DESC' }, take: 1 }))[0].id);
      }
      expect(session.get<number[]>(SESSION_CODE_IDS_KEY)).toEqual(ids.slice(-MAX_CODES_PER_SESSION));
    });

    it('stops issuing codes (silently) once an IP made 10 requests in the window', async () => {
      for (let i = 0; i < MAX_CODE_REQUESTS_PER_IP; i++) {
        expect(await requestCode(JUROR1, '10.0.0.66', new MemorySession())).not.toBeNull();
      }
      const before = await codes().count();
      written = [];
      await service.issue(JUROR1, '10.0.0.66', new MemorySession());
      expect(written.join('')).not.toContain('LOGIN CODE');
      expect(await codes().count()).toBe(before);
      expect(await events().count()).toBe(MAX_CODE_REQUESTS_PER_IP);
      expect(await requestCode(JUROR1, '10.0.0.1', new MemorySession())).not.toBeNull();
    });

    it('counts unknown emails toward the request cap', async () => {
      for (let i = 0; i < MAX_CODE_REQUESTS_PER_IP; i++)
        await requestCode(`nobody${i}@example.com`, '10.0.0.66', new MemorySession());
      expect(await requestCode(JUROR1, '10.0.0.66', new MemorySession())).toBeNull();
    });

    it('holds the request cap under parallel requests from one IP', async () => {
      await Promise.all(
        Array.from({ length: 3 * MAX_CODE_REQUESTS_PER_IP }, () =>
          service.issue(JUROR1, '10.0.0.66', new MemorySession()),
        ),
      );
      expect(await events().count({ where: { ip: '10.0.0.66', kind: 'request' } })).toBe(MAX_CODE_REQUESTS_PER_IP);
      expect(await codes().count()).toBe(MAX_CODE_REQUESTS_PER_IP);
    });

    it('lets the request cap window expire', async () => {
      for (let i = 0; i < MAX_CODE_REQUESTS_PER_IP; i++) await requestCode(JUROR1, '10.0.0.66', new MemorySession());
      expect(await requestCode(JUROR1, '10.0.0.66', new MemorySession())).toBeNull();
      await events().update({ id: MoreThan(0) }, { createdAt: new Date(Date.now() - LOGIN_THROTTLE_WINDOW_MS - 1000) });
      expect(await requestCode(JUROR1, '10.0.0.66', new MemorySession())).not.toBeNull();
    });
  });

  describe('verify', () => {
    it('returns the user, marks the code used and drops its id from the session', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      const claim = await service.verify(` ${JUROR1.toUpperCase()} `, ` ${code} `, '10.0.0.1', session);
      expect(claim?.user.email).toBe(JUROR1);
      expect(claim?.user.roles).toEqual(['juror', 'user']);
      expect((await codes().findOneByOrFail({})).usedAt).not.toBeNull();
      expect(session.get<number[]>(SESSION_CODE_IDS_KEY)).toEqual([]);
      expect(await service.verify(JUROR1, code!, '10.0.0.1', session)).toBeNull();
    });

    it('rejects an expired code', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      await codes().update({ id: MoreThan(0) }, { expiresAt: new Date(Date.now() - 1000) });
      expect(await service.verify(JUROR1, code!, '10.0.0.1', session)).toBeNull();
    });

    it('rejects a code requested for another email, and unknown emails', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      expect(await service.verify('juror2@example.com', code!, '10.0.0.1', session)).toBeNull();
      expect(await service.verify('nobody@example.com', code!, '10.0.0.1', session)).toBeNull();
    });

    it('rejects a code that is not bound to the presenting session', async () => {
      const code = await requestCode(JUROR1, '10.0.0.1', new MemorySession());
      expect(await service.verify(JUROR1, code!, '10.0.0.1', new MemorySession())).toBeNull();
    });

    it('increments failed_attempts of the session codes on a wrong code and locks at 5', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      for (let i = 1; i <= MAX_ATTEMPTS_PER_CODE; i++) {
        expect(await service.verify(JUROR1, wrong(code!), '10.0.0.1', session)).toBeNull();
        expect((await codes().findOneByOrFail({})).failedAttempts).toBe(i);
      }
      expect(await service.verify(JUROR1, code!, '10.0.0.1', session)).toBeNull();
      expect((await codes().findOneByOrFail({})).failedAttempts).toBe(MAX_ATTEMPTS_PER_CODE);
    });

    it('does not burn a victim code with guesses from another session', async () => {
      const victim = new MemorySession();
      const code = await requestCode(ADMIN, '10.0.0.1', victim);
      for (let i = 0; i < MAX_ATTEMPTS_PER_CODE + 1; i++) {
        await service.verify(ADMIN, wrong(code!), '10.0.0.66', new MemorySession());
      }
      expect((await codes().findOneByOrFail({})).failedAttempts).toBe(0);
      expect(await service.verify(ADMIN, code!, '10.0.0.1', victim)).not.toBeNull();
    });

    it('records one failure event per failed verification with the given IP', async () => {
      await service.verify('nobody@example.com', '000000', '10.0.0.66', new MemorySession());
      expect((await events().find()).map((e) => [e.ip, e.kind])).toEqual([['10.0.0.66', 'failure']]);
    });

    it('stops verifying for an IP after 20 failures, but not for other IPs', async () => {
      const attacker = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.66', attacker);
      for (let i = 0; i < MAX_FAILED_VERIFICATIONS_PER_IP; i++) {
        await service.verify(`nobody${i}@example.com`, '000000', '10.0.0.66', new MemorySession());
      }
      expect(await service.verify(JUROR1, code!, '10.0.0.66', attacker)).toBeNull();
      expect(await events().count({ where: { kind: 'failure' } })).toBe(MAX_FAILED_VERIFICATIONS_PER_IP);
      const other = new MemorySession();
      expect(
        await service.verify(JUROR1, (await requestCode(JUROR1, '10.0.0.1', other))!, '10.0.0.1', other),
      ).not.toBeNull();
    });

    it('holds the failure cap under parallel guesses from one IP', async () => {
      await Promise.all(
        Array.from({ length: 2 * MAX_FAILED_VERIFICATIONS_PER_IP }, (_, i) =>
          service.verify(`nobody${i}@example.com`, '000000', '10.0.0.66', new MemorySession()),
        ),
      );
      expect(await events().count({ where: { kind: 'failure' } })).toBe(MAX_FAILED_VERIFICATIONS_PER_IP);
    });

    it('does not count a successful verification as a failure', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      expect(await service.verify(JUROR1, code!, '10.0.0.1', session)).not.toBeNull();
      expect(await events().count({ where: { kind: 'failure' } })).toBe(0);
    });

    it('lets exactly one of two concurrent verifications claim a code', async () => {
      const session = new MemorySession();
      const code = await requestCode(JUROR1, '10.0.0.1', session);
      const twin = new MemorySession();
      twin.data = { ...session.data };
      const results = await Promise.all([
        service.verify(JUROR1, code!, '10.0.0.1', session),
        service.verify(JUROR1, code!, '10.0.0.2', twin),
      ]);
      expect(results.filter((u) => u !== null)).toHaveLength(1);
    });
  });
});
