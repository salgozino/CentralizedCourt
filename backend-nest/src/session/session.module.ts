import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session, User } from '../entities';
import { SessionInterceptor } from './session.interceptor';
import { SessionService } from './session.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, User])],
  providers: [SessionService, { provide: APP_INTERCEPTOR, useClass: SessionInterceptor }],
  exports: [SessionService],
})
export class SessionModule {}
