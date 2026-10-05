import { resolveClientIp } from '../src/http/client-ip';

describe('resolveClientIp', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'trusts the last X-Forwarded-For entry from loopback %s',
    (remote) => {
      expect(resolveClientIp(remote, '10.0.0.1, 10.0.0.66')).toBe('10.0.0.66');
    },
  );

  it('ignores X-Forwarded-For when the remote address is not loopback', () => {
    expect(resolveClientIp('10.0.0.5', '10.0.0.1')).toBe('10.0.0.5');
    expect(resolveClientIp('::ffff:10.0.0.5', '10.0.0.1')).toBe('::ffff:10.0.0.5');
  });

  it('falls back to the remote address when the last entry is not an IP', () => {
    expect(resolveClientIp('127.0.0.1', '10.0.0.1, garbage')).toBe('127.0.0.1');
    expect(resolveClientIp('127.0.0.1', '10.0.0.1,')).toBe('127.0.0.1');
  });

  it('uses the remote address when there is no X-Forwarded-For', () => {
    expect(resolveClientIp('127.0.0.1', undefined)).toBe('127.0.0.1');
    expect(resolveClientIp('127.0.0.1', '')).toBe('127.0.0.1');
  });

  it('trims the entry and accepts IPv6', () => {
    expect(resolveClientIp('127.0.0.1', '10.0.0.1,   2001:db8::1  ')).toBe('2001:db8::1');
  });
});
