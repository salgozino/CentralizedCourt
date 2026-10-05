import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { resolveClientIp } from '../http/client-ip';
import { requestCookies } from '../http/cookies';
import { ZodBodyPipe } from '../http/validation';
import { SessionService } from '../session/session.service';

import { CSRF_COOKIE, isValidSecret, newCsrfSecret, setCsrfCookie } from './csrf';
import { RequestCodeIn, UserOut, VerifyIn, toUserOut } from './dto';
import { LoginCodeService } from './login-code.service';
import { AuthenticatedRequest, SessionAuthGuard } from './session-auth.guard';

const clientIp = (req: Request) =>
  resolveClientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'] as string | undefined);

@Controller()
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly loginCodes: LoginCodeService,
  ) {}

  @Post('auth/request-code')
  @HttpCode(200)
  async requestCode(@Req() req: Request, @Body(new ZodBodyPipe(RequestCodeIn)) payload: RequestCodeIn) {
    await this.loginCodes.issue(payload.email, clientIp(req), await this.sessions.get(req));
    return { detail: 'If the email exists, a code was sent.' };
  }

  /**
   * The code is claimed first, then the session is saved and the cookie queued, and only then is the CSRF cookie
   * rotated and the user returned. If saving the session fails the claim is undone, so the same code works on
   * retry instead of being burned without a login.
   */
  @Post('auth/verify')
  @HttpCode(200)
  async verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodBodyPipe(VerifyIn)) payload: VerifyIn,
  ): Promise<UserOut> {
    const session = await this.sessions.get(req);
    const claim = await this.loginCodes.verify(payload.email, payload.code, clientIp(req), session);
    if (!claim) throw new UnauthorizedException('Invalid or expired code');
    try {
      await this.sessions.login(session, claim.user);
      await this.sessions.commit(req, res);
    } catch (error) {
      await claim.undo();
      throw error;
    }
    setCsrfCookie(res, newCsrfSecret()); // rotated on login
    return toUserOut(claim.user);
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
