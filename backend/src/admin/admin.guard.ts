import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/session-auth.guard';

/** Requires the admin flag. Put it AFTER SessionAuthGuard and CsrfGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user.isAdmin) throw new ForbiddenException('Admin role required');
    return true;
  }
}
