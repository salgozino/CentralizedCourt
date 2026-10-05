import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { CsrfGuard } from './csrf.guard';
import { LoginCodeService } from './login-code.service';
import { SessionAuthGuard } from './session-auth.guard';

/** Guards are exported for reuse: `@UseGuards(SessionAuthGuard, CsrfGuard)` (auth first, then CSRF). */
@Module({
  imports: [SessionModule],
  controllers: [AuthController],
  providers: [LoginCodeService, SessionAuthGuard, CsrfGuard],
  exports: [SessionModule, SessionAuthGuard, CsrfGuard],
})
export class AuthModule {}
