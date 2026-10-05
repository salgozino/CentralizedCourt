import { isIP } from 'node:net';

/** Proxies whose X-Forwarded-For is trusted for per-IP login throttling (Vite dev proxy). */
export const TRUSTED_PROXY_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Socket address, unless it is a trusted proxy that forwarded a valid client IP.
 * The proxy appends the real client address, so earlier entries are client-controlled
 * and only the last one is read.
 */
export function resolveClientIp(remote: string | undefined, forwardedFor: string | undefined): string {
  const remoteAddress = remote ?? '';
  if (!TRUSTED_PROXY_IPS.includes(remoteAddress) || !forwardedFor) return remoteAddress;
  const last = forwardedFor.split(',').at(-1)!.trim();
  return isIP(last) ? last : remoteAddress;
}
