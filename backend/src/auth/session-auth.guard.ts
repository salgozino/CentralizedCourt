import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { User } from '../entities';
import { SessionService } from '../session/session.service';

export type AuthenticatedRequest = Request & { user: User };

/** Requires a live session of an active user; the user is re-read from the DB on every request. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await this.sessions.currentUser(req);
    if (!user) throw new UnauthorizedException('Unauthorized');
    (req as AuthenticatedRequest).user = user;
    return true;
  }
}
