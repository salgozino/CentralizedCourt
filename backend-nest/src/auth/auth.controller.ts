import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { User } from '../entities';
import { resolveClientIp } from '../http/client-ip';
import { requestCookies } from '../http/cookies';
import { ZodBodyPipe } from '../http/validation';
import { SESSION_USER_KEY, SessionService } from '../session/session.service';
import { CSRF_COOKIE, isValidSecret, newCsrfSecret, setCsrfCookie } from './csrf';
import { RequestCodeIn, UserOut, VerifyIn, toUserOut } from './dto';
import { LoginCodeService } from './login-code.service';
import { AuthenticatedRequest, SessionAuthGuard } from './session-auth.guard';

const clientIp = (req: Request) => resolveClientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'] as string | undefined);

@Controller()
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly loginCodes: LoginCodeService,
  ) {}

  @Post('auth/request-code')
  @HttpCode(200)
  async requestCode(@Req() req: Request, @Body(new ZodBodyPipe(RequestCodeIn)) payload: { email: string }) {
    await this.loginCodes.issue(payload.email, clientIp(req), await this.sessions.get(req));
    return { detail: 'If the email exists, a code was sent.' };
  }

  @Post('auth/verify')
  @HttpCode(200)
  async verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodBodyPipe(VerifyIn)) payload: { email: string; code: string },
  ): Promise<UserOut> {
    const session = await this.sessions.get(req);
    const user = await this.loginCodes.verify(payload.email, payload.code, clientIp(req), session);
    if (!user) throw new UnauthorizedException('Invalid or expired code');
    await this.sessions.login(session, user);
    setCsrfCookie(res, newCsrfSecret()); // rotated on login, like Django
    return toUserOut(user);
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request) {
    (await this.sessions.get(req)).flush();
    return { detail: 'Logged out' };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response): UserOut {
    const existing = requestCookies(req)[CSRF_COOKIE];
    setCsrfCookie(res, isValidSecret(existing) ? existing : newCsrfSecret());
    return toUserOut(req.user);
  }
}
