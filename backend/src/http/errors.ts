import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';

export interface ValidationDetail {
  type: string;
  loc: Array<string | number>;
  msg: string;
  ctx?: Record<string, unknown>;
}

/** 422 whose body is `{detail: [...]}`, shaped like pydantic's errors. */
export class UnprocessableException extends HttpException {
  constructor(detail: ValidationDetail[] | string) {
    super({ detail }, 422);
  }
}

/** Renders every error as `{"detail": ...}`, the shape of the API contract. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    const { status, detail } = this.describe(exception);
    res.status(status).json({ detail });
  }

  private describe(exception: unknown): { status: number; detail: unknown } {
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
      return { status: 500, detail: 'Internal Server Error' };
    }
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'string') return { status, detail: this.routerMessage(exception, body) };
    const fields = body as { detail?: unknown; message?: unknown };
    if (fields.detail !== undefined) return { status, detail: fields.detail };
    const message = Array.isArray(fields.message) ? fields.message.join(', ') : fields.message;
    return { status, detail: this.routerMessage(exception, String(message ?? exception.message)) };
  }

  /** Nest words unknown routes as "Cannot GET /x"; the API says "Not Found". */
  private routerMessage(exception: HttpException, message: string): string {
    return exception instanceof NotFoundException && /^Cannot [A-Z]+ /.test(message) ? 'Not Found' : message;
  }
}
