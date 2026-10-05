import { SessionStore } from './session-store';

export const SESSION_COOKIE = 'sessionid';
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export type SessionData = Record<string, unknown>;

/**
 * One request's view of its session. Mutations are only recorded here; the
 * SessionService writes them (and the cookie) once, when the response is ready.
 */
export class SessionHandle implements SessionStore {
  modified = false;
  /** Keys whose rows must be deleted on commit (flushed or rotated away). */
  readonly discarded: string[] = [];

  constructor(
    /** Key of the stored session this request presented, null for a new/unknown one. */
    public key: string | null,
    public data: SessionData,
    /** The request carried a sessionid cookie, whether or not it matched a live session. */
    readonly hadCookie: boolean,
  ) {}

  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.modified = true;
  }

  isEmpty(): boolean {
    return Object.keys(this.data).length === 0;
  }

  /** New key, same data (session fixation defence on login). */
  cycleKey(): void {
    if (this.key) this.discarded.push(this.key);
    this.key = null;
    this.modified = true;
  }

  /** Drops the data and the stored row. */
  flush(): void {
    if (this.key) this.discarded.push(this.key);
    this.key = null;
    this.data = {};
    this.modified = true;
  }
}
