import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { SessionService } from './session.service';

/** Writes session changes (and the cookie) before the response is sent, success or not. */
@Injectable()
export class SessionInterceptor implements NestInterceptor {
  constructor(private readonly sessions: SessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const commit = () => this.sessions.commit(http.getRequest<Request>(), http.getResponse<Response>());
    return next.handle().pipe(
      mergeMap((value) => from(commit().then(() => value))),
      catchError((error) => from(commit()).pipe(mergeMap(() => throwError(() => error)))),
    );
  }
}
