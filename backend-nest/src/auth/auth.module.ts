import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoginCode, LoginEvent, User } from '../entities';
import { SessionModule } from '../session/session.module';
import { AuthController } from './auth.controller';
import { CsrfGuard } from './csrf.guard';
import { LoginCodeService } from './login-code.service';
import { SessionAuthGuard } from './session-auth.guard';

/** Guards are exported for reuse: `@UseGuards(SessionAuthGuard, CsrfGuard)` (auth first, then CSRF). */
@Module({
  imports: [SessionModule, TypeOrmModule.forFeature([User, LoginCode, LoginEvent])],
  controllers: [AuthController],
  providers: [LoginCodeService, SessionAuthGuard, CsrfGuard],
  exports: [SessionModule, SessionAuthGuard, CsrfGuard],
})
export class AuthModule {}
