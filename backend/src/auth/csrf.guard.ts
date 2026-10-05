import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { requestCookies } from '../http/cookies';

import { CSRF_COOKIE, CSRF_HEADER, TRUSTED_ORIGINS, isValidSecret, tokenMatches } from './csrf';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * Double-submit CSRF check for session-authenticated unsafe requests. Put it AFTER
 * SessionAuthGuard: anonymous requests are left to answer 401 first.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    if (SAFE_METHODS.has(req.method) || !req.user) return true;
    if (!this.originAllowed(req)) throw this.failure();
    const secret = requestCookies(req)[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (!isValidSecret(secret) || typeof header !== 'string' || !tokenMatches(header, secret)) throw this.failure();
    return true;
  }

  /** Over plain http a request without Origin passes, one with Origin must be trusted or same-origin. */
  private originAllowed(req: Request): boolean {
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    return TRUSTED_ORIGINS.includes(origin) || origin === `${req.protocol}://${req.headers.host}`;
  }

  private failure(): ForbiddenException {
    return new ForbiddenException('CSRF check Failed');
  }
}
