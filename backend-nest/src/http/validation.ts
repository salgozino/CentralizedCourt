import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { UnprocessableException, ValidationDetail } from './errors';

const TYPE_MESSAGES: Record<string, { type: string; msg: string }> = {
  string: { type: 'string_type', msg: 'Input should be a valid string' },
  number: { type: 'float_type', msg: 'Input should be a valid number' },
  int: { type: 'int_type', msg: 'Input should be a valid integer' },
  boolean: { type: 'bool_type', msg: 'Input should be a valid boolean' },
  array: { type: 'list_type', msg: 'Input should be a valid list' },
  object: { type: 'model_attributes_type', msg: 'Input should be a valid dictionary or object to extract fields from' },
};

function valueAt(root: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let current = root;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

/** Pydantic's wording for a set of allowed literals: 'a', 'b' or 'c'. */
function expectedLiterals(values: readonly unknown[]): string {
  const quoted = values.map((v) => `'${String(v)}'`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}` : quoted[0];
}

function toDetail(issue: z.core.$ZodIssue, body: unknown): ValidationDetail {
  const loc = ['body', 'payload', ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))];
  if (issue.code === 'invalid_type') {
    if (valueAt(body, issue.path) === undefined) return { type: 'missing', loc, msg: 'Field required' };
    const known = TYPE_MESSAGES[issue.expected === 'number' && /int/.test(issue.message) ? 'int' : issue.expected];
    if (known) return { loc, ...known };
  }
  if (issue.code === 'invalid_value') {
    const expected = expectedLiterals(issue.values);
    return { type: 'literal_error', loc, msg: `Input should be ${expected}`, ctx: { expected } };
  }
  return { type: issue.code, loc, msg: issue.message };
}

/** Validates a request body; every failure becomes a pydantic-shaped 422. */
export class ZodBodyPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(body: unknown): z.infer<T> {
    if (body === undefined) {
      throw new UnprocessableException([{ type: 'missing', loc: ['body', 'payload'], msg: 'Field required' }]);
    }
    const result = this.schema.safeParse(body);
    if (!result.success) throw new UnprocessableException(result.error.issues.map((i) => toDetail(i, body)));
    return result.data;
  }
}
