import { createHash } from 'node:crypto';

import { codeSince, stdoutMark } from './stdout';

export const ORIGIN = 'http://localhost:5173';

export interface Resp {
  status: number;
  body: any;
  text: string;
  setCookies: string[];
}

interface Options {
  json?: unknown;
  /** Raw request body, sent with a JSON content type. */
  raw?: string;
  headers?: Record<string, string>;
  /** Send the X-CSRFToken header from the cookie jar (default true for unsafe methods). */
  csrf?: boolean;
}

let counter = 0;

/**
 * Distinct simulated client IP per call. The second octet is derived from the test file,
 * so files sharing one backend process never share IP-throttling buckets.
 */
export function newIp(): string {
  const file = expect.getState().testPath ?? '';
  const ns = createHash('sha256').update(file).digest()[0] % 250;
  counter += 1;
  return `10.${ns}.${Math.floor(counter / 250) % 250}.${(counter % 250) + 1}`;
}

/** One simulated browser: its own cookie jar and its own client IP (via X-Forwarded-For). */
export class Client {
  readonly jar = new Map<string, string>();
  /** Raw Set-Cookie headers of the latest response that set each cookie name. */
  readonly rawCookies = new Map<string, string>();

  constructor(
    public ip: string | null = newIp(),
    private xff: string | null = null,
  ) {}

  /** Client whose X-Forwarded-For is exactly `value`, e.g. "10.0.0.1, 10.0.0.66". */
  static withForwardedFor(value: string): Client {
    return new Client(null, value);
  }

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  async request(method: string, path: string, opts: Options = {}): Promise<Resp> {
    const headers: Record<string, string> = { Origin: ORIGIN, ...opts.headers };
    const forwarded = this.xff ?? this.ip;
    if (forwarded) headers['X-Forwarded-For'] = forwarded;
    if (this.jar.size) headers.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if ((opts.csrf ?? unsafe) && this.jar.has('csrftoken') && !('X-CSRFToken' in headers)) {
      headers['X-CSRFToken'] = this.jar.get('csrftoken')!;
    }
    let body: string | undefined;
    if (opts.json !== undefined) body = JSON.stringify(opts.json);
    if (opts.raw !== undefined) body = opts.raw;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${process.env.CONTRACT_BASE_URL}${path}`, { method, headers, body, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie();
    this.absorb(setCookies);
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, body: parsed, text, setCookies };
  }

  private absorb(setCookies: string[]): void {
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      const expires = attrs.find((a) => /^expires=/i.test(a));
      const expired =
        (maxAge !== undefined && Number(maxAge.split('=')[1]) <= 0) ||
        (expires !== undefined && Date.parse(expires.split('=')[1]) < Date.now());
      this.rawCookies.set(name, raw);
      if (expired || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  get(path: string, opts?: Options) {
    return this.request('GET', path, opts);
  }
  post(path: string, json?: unknown, opts?: Options) {
    return this.request('POST', path, { json, ...opts });
  }
  put(path: string, json?: unknown, opts?: Options) {
    return this.request('PUT', path, { json, ...opts });
  }

  /** Requests a login code; returns the code printed by this very request, or null if none was printed. */
  async requestCode(email: string): Promise<string | null> {
    const mark = stdoutMark();
    const res = await this.post('/api/auth/request-code', { email });
    expect(res.status).toBe(200);
    return codeSince(email.trim().toLowerCase(), mark);
  }

  verify(email: string, code: string) {
    return this.post('/api/auth/verify', { email, code });
  }

  /** Full login through the API; returns this client. */
  async login(email: string): Promise<this> {
    const code = await this.requestCode(email);
    expect(code).not.toBeNull();
    const res = await this.verify(email, code!);
    expect(res.status).toBe(200);
    return this;
  }
}

export function wrongCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
}

export const REQUEST_CODE_DETAIL = 'If the email exists, a code was sent.';
