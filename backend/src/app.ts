import { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ApiExceptionFilter } from './http/errors';

export const GLOBAL_PREFIX = 'api';

/**
 * Parses JSON bodies and answers malformed ones with 422, matching the API contract. Registered before
 * Nest's own parser (which would answer 400 and never learns it was a parse failure); once this
 * one has run, Nest's is skipped.
 */
function jsonBody() {
  const parse = json({ strict: false });
  return (req: Request, res: Response, next: NextFunction) =>
    parse(req, res, (error?: unknown) => {
      if (!error) return next();
      const status = (error as { status?: number }).status;
      if (status === 400) return res.status(422).json({ detail: 'Cannot parse request body' });
      next(error);
    });
}

/** Shared by main.ts and the tests so both see the same HTTP surface. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(jsonBody());
  app.useGlobalFilters(new ApiExceptionFilter());
}
