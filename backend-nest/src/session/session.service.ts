import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { In, Repository } from 'typeorm';
import { Session, User } from '../entities';
import { deleteCookie, requestCookies, setCookie } from '../http/cookies';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SessionHandle } from './session-handle';

/** Key of the user id inside the session data. */
export const SESSION_USER_KEY = 'userId';

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

  /** Persists what the request changed and sets/clears the cookie. A no-op when the session was never touched. */
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
    handle.key ??= randomBytes(24).toString('base64url');
    await this.sessions.save({
      id: handle.key,
      data: handle.data,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    });
    setCookie(res, SESSION_COOKIE, handle.key, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS, httpOnly: true });
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
