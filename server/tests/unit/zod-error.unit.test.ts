import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { formatZodError } from '../../src/utils/zodError';

describe('formatZodError', () => {
  it('formats zod errors with paths', () => {
    const err = new ZodError([
      {
        code: 'custom',
        path: ['email'],
        message: 'Invalid email',
      },
      {
        code: 'custom',
        path: ['password'],
        message: 'Too short',
      },
    ]);

    expect(formatZodError(err)).toContain('email: Invalid email');
    expect(formatZodError(err)).toContain('password: Too short');
  });
});
