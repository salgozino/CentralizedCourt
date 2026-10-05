import { z } from 'zod';

import { UnprocessableException } from '../src/http/errors';
import { ZodBodyPipe } from '../src/http/validation';

function detailOf(schema: z.ZodType, body: unknown): unknown {
  try {
    new ZodBodyPipe(schema).transform(body);
  } catch (error) {
    if (error instanceof UnprocessableException) return (error.getResponse() as { detail: unknown }).detail;
    throw error;
  }
  throw new Error('expected a validation failure');
}

describe('ZodBodyPipe', () => {
  it('reports a missing field', () => {
    expect(detailOf(z.object({ n: z.string() }), {})).toEqual([
      { type: 'missing', loc: ['body', 'payload', 'n'], msg: 'Field required' },
    ]);
  });

  it('classifies wrong types by the structured issue, not by its message', () => {
    // A custom message that happens to contain "int" must not turn a number type error into an int one.
    const schema = z.object({ n: z.number({ error: 'Pick a point on the map' }) });
    expect(detailOf(schema, { n: 'x' })).toEqual([
      { type: 'float_type', loc: ['body', 'payload', 'n'], msg: 'Input should be a valid number' },
    ]);
  });

  it('reports a non-integer number for an integer field as int_type', () => {
    expect(detailOf(z.object({ n: z.int() }), { n: 1.5 })).toEqual([
      { type: 'int_type', loc: ['body', 'payload', 'n'], msg: 'Input should be a valid integer' },
    ]);
  });

  it('describes a bad literal like pydantic', () => {
    expect(detailOf(z.object({ r: z.enum(['a', 'b']) }), { r: 'c' })).toEqual([
      {
        type: 'literal_error',
        loc: ['body', 'payload', 'r'],
        msg: "Input should be 'a' or 'b'",
        ctx: { expected: "'a' or 'b'" },
      },
    ]);
  });
});
