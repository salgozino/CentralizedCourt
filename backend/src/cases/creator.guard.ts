import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthenticatedRequest } from '../auth/session-auth.guard';

/** Requires the creator flag; admins pass too. Put it AFTER SessionAuthGuard and CsrfGuard. */
@Injectable()
export class CreatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user.isCreator && !user.isAdmin) throw new ForbiddenException('Only creators can create cases');
    return true;
  }
}
