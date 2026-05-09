import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTurnstileEnabled, verifyTurnstileToken } from '../../src/utils/turnstile';

const ORIGINAL_TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_TURNSTILE_SECRET_KEY) {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_TURNSTILE_SECRET_KEY;
  } else {
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

describe('turnstile utility', () => {
  it('is disabled when TURNSTILE_SECRET_KEY is not set', () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(isTurnstileEnabled()).toBe(false);
  });

  it('is enabled when TURNSTILE_SECRET_KEY is set', () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    expect(isTurnstileEnabled()).toBe(true);
  });

  it('skips verification when Turnstile is disabled', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifyTurnstileToken(undefined)).resolves.toBe(true);
  });

  it('fails verification when token is missing while enabled', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    await expect(verifyTurnstileToken(undefined)).resolves.toBe(false);
  });

  it('passes verification when Cloudflare responds success=true', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(verifyTurnstileToken('valid-token', '127.0.0.1')).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails verification when Cloudflare responds success=false', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(verifyTurnstileToken('invalid-token')).resolves.toBe(false);
  });
});
