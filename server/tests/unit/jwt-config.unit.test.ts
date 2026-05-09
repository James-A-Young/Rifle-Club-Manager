/**
 * Unit tests for the JWT configuration module.
 *
 * Verifies the fail-fast behaviour: the server must refuse to start if
 * JWT_SECRET is absent or shorter than 32 characters.
 *
 * Because the config module executes validation at import time we use
 * vi.resetModules() + dynamic import() to re-evaluate the module for each test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('JWT config — fail-fast startup', () => {
  it('throws when JWT_SECRET is not set', async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(import('../../src/config/jwt')).rejects.toThrow(
      /JWT_SECRET environment variable is not set/,
    );
    process.env.JWT_SECRET = original;
  });

  it('throws when JWT_SECRET is shorter than 32 characters', async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'too-short';
    await expect(import('../../src/config/jwt')).rejects.toThrow(
      /JWT_SECRET is too short/,
    );
    process.env.JWT_SECRET = original;
  });

  it('exports jwtSecret when JWT_SECRET meets the minimum length', async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'a'.repeat(32);
    const mod = await import('../../src/config/jwt');
    expect(mod.jwtSecret).toBe('a'.repeat(32));
    process.env.JWT_SECRET = original;
  });
});
