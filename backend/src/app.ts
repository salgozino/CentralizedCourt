import { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { ApiExceptionFilter } from './http/errors';

export const GLOBAL_PREFIX = 'api';

/**
 * Options for NestFactory.create / createNestApplication. Nest's built-in body parsers are switched off:
 * `jsonBody` below is the only body parser, so every parse failure goes through it and keeps the API's error shape.
 */
export const APP_OPTIONS = { bodyParser: false } as const;

/** Body-parser failures carry an HTTP status, a machine-readable `type` and, for 4xx, a message safe to show. */
interface BodyParserError {
  status?: number;
  type?: string;
  expose?: boolean;
  message?: string;
}

/**
 * Parses JSON bodies. Malformed JSON answers 422 `Cannot parse request body`, matching the API contract;
 * other parser failures (413 too large, 415 unsupported charset/encoding, ...) keep their status and message.
 * All are rendered as `{"detail": ...}`, which Nest's exception filter cannot do because this runs before routing.
 */
function jsonBody() {
  const parse = json({ strict: false });
  return (req: Request, res: Response, next: NextFunction) =>
    parse(req, res, (error?: unknown) => {
      if (!error) return next();
      const { status, type, expose, message } = error as BodyParserError;
      if (type === 'entity.parse.failed') return res.status(422).json({ detail: 'Cannot parse request body' });
      if (status !== undefined && status >= 400 && status < 500 && expose)
        return res.status(status).json({ detail: message });
      next(error);
    });
}

/** Shared by main.ts and the tests so both see the same HTTP surface. The app must be created with APP_OPTIONS. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(jsonBody());
  app.useGlobalFilters(new ApiExceptionFilter());
}
