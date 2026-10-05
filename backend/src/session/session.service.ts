import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { In, Repository } from 'typeorm';

import { Session, User } from '../entities';
import { deleteCookie, requestCookies, setCookie } from '../http/cookies';

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SessionData, SessionHandle } from './session-handle';

/** Key of the user id inside the session data. */
export const SESSION_USER_KEY = 'userId';

/** Session data keys are interpolated into JSON paths, so they are restricted to plain identifiers. */
const DATA_KEY_FORMAT = /^[A-Za-z0-9_]+$/;
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,64}$/;
const HANDLES = new WeakMap<Request, Promise<SessionHandle>>();

/** Database-backed sessions: opaque random key in the `sessionid` cookie, data and expiry in the table. */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** The request's session, loaded once. Expired or unknown keys yield an empty session. */
  get(req: Request): Promise<SessionHandle> {
    let handle = HANDLES.get(req);
    if (!handle) {
      handle = this.load(req);
      HANDLES.set(req, handle);
    }
    return handle;
  }

  /** The active user of the request's session, read fresh from the database; null when anonymous. */
  async currentUser(req: Request): Promise<User | null> {
    const userId = (await this.get(req)).get<number>(SESSION_USER_KEY);
    if (typeof userId !== 'number') return null;
    return this.users.findOneBy({ id: userId, isActive: true });
  }

  /** Logs the user in: rotates the key (or flushes a session of another user) and records the user id. */
  async login(handle: SessionHandle, user: User): Promise<void> {
    const current = handle.get<number>(SESSION_USER_KEY);
    if (current !== undefined && current !== user.id) handle.flush();
    else handle.cycleKey();
    handle.set(SESSION_USER_KEY, user.id);
    await this.users.update({ id: user.id }, { lastLogin: new Date() });
  }

  /**
   * Persists what the request changed and sets/clears the cookie. A no-op when the session was never touched.
   * Writes are single atomic statements, so no request can undo another's: only this request's keys are merged
   * onto the current row, and a row that no longer exists (logout, rotation) is never written back.
   */
  async commit(req: Request, res: Response): Promise<void> {
    const pending = HANDLES.get(req);
    if (!pending) return;
    const handle = await pending;
    if (!handle.modified || res.headersSent) return;
    HANDLES.delete(req);
    if (handle.discarded.length) await this.sessions.delete({ id: In(handle.discarded) });
    if (handle.isEmpty()) {
      if (handle.hadCookie) deleteCookie(res, SESSION_COOKIE);
      return;
    }
    const key = await this.persist(handle);
    if (key) setCookie(res, SESSION_COOKIE, key, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS, httpOnly: true });
  }

  /** The key the cookie must carry afterwards, or null when the session this request used is gone. */
  private async persist(handle: SessionHandle): Promise<string | null> {
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    if (handle.key) return (await this.merge(handle.key, handle.key, handle.changes, expiresAt)) ? handle.key : null;
    const key = randomBytes(24).toString('base64url');
    if (handle.rotatedFrom && (await this.merge(handle.rotatedFrom, key, handle.changes, expiresAt))) return key;
    // Created in this request, or the rotated row vanished meanwhile: the key is new, nothing is resurrected.
    await this.sessions.save(this.sessions.create({ id: key, data: handle.changes, expiresAt }));
    return key;
  }

  /** Applies `changes` to the row `from` (renaming it to `to`) in one statement; false when that row does not exist. */
  private async merge(from: string, to: string, changes: SessionData, expiresAt: Date): Promise<boolean> {
    const params: Record<string, string> = {};
    let data = 'data';
    Object.entries(changes).forEach(([name, value], i) => {
      if (!DATA_KEY_FORMAT.test(name)) throw new Error(`Invalid session data key: ${name}`);
      params[`value${i}`] = JSON.stringify(value);
      data = `json_set(${data}, '$.${name}', json(:value${i}))`;
    });
    const result = await this.sessions
      .createQueryBuilder()
      .update()
      .set({ ...(to === from ? {} : { id: to }), expiresAt, data: () => data })
      .where('id = :from', { from })
      .setParameters(params)
      .execute();
    return result.affected === 1;
  }

  private async load(req: Request): Promise<SessionHandle> {
    const key = requestCookies(req)[SESSION_COOKIE];
    if (key === undefined) return new SessionHandle(null, {}, false);
    if (!KEY_FORMAT.test(key)) return new SessionHandle(null, {}, true);
    const row = await this.sessions.findOneBy({ id: key });
    if (!row) return new SessionHandle(null, {}, true);
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete({ id: key });
      return new SessionHandle(null, {}, true);
    }
    return new SessionHandle(key, row.data, true);
  }
}
