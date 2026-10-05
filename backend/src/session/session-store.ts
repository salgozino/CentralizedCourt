/** The part of a session the login-code service needs. */
export interface SessionStore {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}
