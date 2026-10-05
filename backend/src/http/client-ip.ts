import { isIP } from 'node:net';

/** Proxies whose X-Forwarded-For is trusted for per-IP login throttling (Vite dev proxy). */
export const TRUSTED_PROXY_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Socket address, unless it is a trusted proxy that forwarded a valid client IP.
 * The proxy appends the real client address, so earlier entries are client-controlled
 * and only the last one is read.
 *
 * Trust boundary (intended contract, not a defect): any process that can connect from loopback is
 * trusted to name the client, because in development the only such peer is the Vite proxy. Behind a
 * proxy on another host this would have to become an explicit allow-list. Addresses are compared as
 * text, so the IPv4-mapped form (`::ffff:a.b.c.d`) of a client is a different bucket from `a.b.c.d`;
 * that cannot be exploited since the trusted proxy writes the entry, not the client.
 */
export function resolveClientIp(remote: string | undefined, forwardedFor: string | undefined): string {
  const remoteAddress = remote ?? '';
  if (!TRUSTED_PROXY_IPS.includes(remoteAddress) || !forwardedFor) return remoteAddress;
  const last = forwardedFor.split(',').at(-1)!.trim();
  return isIP(last) ? last : remoteAddress;
}
