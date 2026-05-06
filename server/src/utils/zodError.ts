import { ZodError } from 'zod';

export function formatZodError(error: ZodError): string {
  const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return messages || 'Validation failed';
}
