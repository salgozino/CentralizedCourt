import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { DataSource, In, IsNull, LessThan, MoreThan } from 'typeorm';
import { DateUtils } from 'typeorm/util/DateUtils';
import { LoginCode, LoginEvent, LoginEventKind, User } from '../entities';
import { SessionStore } from '../session/session-store';

export const SESSION_CODE_IDS_KEY = 'loginCodeIds';
export const CODE_TTL_MS = 10 * 60 * 1000;
export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_CODES_PER_SESSION = 5;
export const MAX_ATTEMPTS_PER_CODE = 5;
export const MAX_CODE_REQUESTS_PER_IP = 10;
export const MAX_FAILED_VERIFICATIONS_PER_IP = 20;

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A successful verification. `undo` gives the code back when the login could not be completed. */
export interface LoginClaim {
  user: User;
  undo(): Promise<void>;
}

@Injectable()
export class LoginCodeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get codes() {
    return this.dataSource.getRepository(LoginCode);
  }

  private get events() {
    return this.dataSource.getRepository(LoginEvent);
  }

  private findUser(email: string): Promise<User | null> {
    // The column transformer lowercases the condition, so this is case-insensitive.
    return this.dataSource.getRepository(User).findOneBy({ email: email.trim() });
  }

  /**
   * Records an event for the IP unless it already has `cap` of that kind in the window. Count and insert are
   * one statement, so parallel requests cannot slip past the cap. Returns the event id, null when over the cap.
   */
  private async recordUnlessOverCap(ip: string, kind: LoginEventKind, cap: number): Promise<number | null> {
    const since = DateUtils.mixedDateToUtcDatetimeString(new Date(Date.now() - LOGIN_THROTTLE_WINDOW_MS));
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `INSERT INTO login_events (ip, kind) SELECT ?, ?
       WHERE (SELECT COUNT(*) FROM login_events WHERE ip = ? AND kind = ? AND createdAt > ?) < ?
       RETURNING id`,
      [ip, kind, ip, kind, since, cap],
    );
    return rows.length ? rows[0].id : null;
  }

  /** Usable codes held by this browser session for that user. */
  private sessionCodes(session: SessionStore, user: User | null, now: Date): Promise<LoginCode[]> {
    const ids = session.get<number[]>(SESSION_CODE_IDS_KEY) ?? [];
    if (!user || ids.length === 0) return Promise.resolve([]);
    return this.codes.findBy({
      id: In(ids),
      userId: user.id,
      usedAt: IsNull(),
      expiresAt: MoreThan(now),
      failedAttempts: LessThan(MAX_ATTEMPTS_PER_CODE),
    });
  }

  async issue(email: string, ip: string, session: SessionStore): Promise<void> {
    // Unknown emails are counted too, so throttling does not reveal which emails exist.
    if ((await this.recordUnlessOverCap(ip, 'request', MAX_CODE_REQUESTS_PER_IP)) === null) {
      // Avoid the literal phrase of the stdout code line, which tooling greps for.
      process.stderr.write(`Code request ignored: IP ${ip} is over the request cap\n`);
      return;
    }
    const user = await this.findUser(email);
    // The session is touched for unknown emails as well: a Set-Cookie must not reveal that an account exists.
    if (!user) {
      session.set(SESSION_CODE_IDS_KEY, session.get<number[]>(SESSION_CODE_IDS_KEY) ?? []);
      return;
    }
    const now = new Date();
    // Only revoke codes held by this session; other sessions' codes are untouched.
    const live = await this.sessionCodes(session, user, now);
    if (live.length) await this.codes.update({ id: In(live.map((c) => c.id)) }, { usedAt: now });
    const code = String(randomInt(1_000_000)).padStart(6, '0');
    const created = await this.codes.save(
      this.codes.create({ userId: user.id, codeHash: hashCode(code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) }),
    );
    const ids = [...(session.get<number[]>(SESSION_CODE_IDS_KEY) ?? []), created.id];
    session.set(SESSION_CODE_IDS_KEY, ids.slice(-MAX_CODES_PER_SESSION));
    process.stdout.write(`LOGIN CODE ${user.email} ${code}\n`);
  }

  /**
   * Checks a code and claims it. A failed attempt takes a slot of the IP's failure budget up front (atomically,
   * see recordUnlessOverCap) and a success gives it back, so parallel guesses cannot exceed the cap either.
   */
  async verify(email: string, code: string, ip: string, session: SessionStore): Promise<LoginClaim | null> {
    const slot = await this.recordUnlessOverCap(ip, 'failure', MAX_FAILED_VERIFICATIONS_PER_IP);
    if (slot === null) return null;
    const now = new Date();
    const candidate = hashCode(code.trim());
    const user = await this.findUser(email);
    const codes = await this.sessionCodes(session, user, now);
    for (const loginCode of codes) {
      if (!sameHash(loginCode.codeHash, candidate)) continue;
      // Atomic claim: only one concurrent verification can flip usedAt from NULL.
      const claim = await this.codes.update({ id: loginCode.id, usedAt: IsNull() }, { usedAt: now });
      if (claim.affected === 1) {
        const ids = session.get<number[]>(SESSION_CODE_IDS_KEY) ?? [];
        session.set(SESSION_CODE_IDS_KEY, ids.filter((id) => id !== loginCode.id));
        await this.events.delete({ id: slot });
        return { user: user!, undo: async () => void (await this.codes.update({ id: loginCode.id }, { usedAt: null })) };
      }
    }
    if (codes.length) {
      await this.codes
        .createQueryBuilder()
        .update()
        .set({ failedAttempts: () => 'failedAttempts + 1' })
        .whereInIds(codes.map((c) => c.id))
        .execute();
    }
    return null;
  }
}
