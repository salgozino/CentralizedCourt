import type { Request, Response } from 'express';

export interface CookieOptions {
  maxAgeSeconds: number;
  httpOnly: boolean;
}

/** Last occurrence wins, like Django's parse_cookie. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name) cookies[name] = part.slice(eq + 1).trim();
  }
  return cookies;
}

export function requestCookies(req: Request): Record<string, string> {
  return parseCookies(req.headers.cookie);
}

// Values are opaque ASCII tokens, so nothing needs encoding.
export function setCookie(res: Response, name: string, value: string, options: CookieOptions): void {
  const expires = new Date(Date.now() + options.maxAgeSeconds * 1000).toUTCString();
  const parts = [`${name}=${value}`, `expires=${expires}`];
  if (options.httpOnly) parts.push('HttpOnly');
  parts.push(`Max-Age=${options.maxAgeSeconds}`, 'Path=/', 'SameSite=Lax');
  res.append('Set-Cookie', parts.join('; '));
}

export function deleteCookie(res: Response, name: string): void {
  res.append('Set-Cookie', `${name}=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=Lax`);
}
