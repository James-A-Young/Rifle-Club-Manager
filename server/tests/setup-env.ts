process.env.NODE_ENV = 'test';
// Use a sufficiently long secret (≥32 chars) to satisfy the JWT validation requirement
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-only-do-not-use-in-prod';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
process.env.TOTP_SECRET_ENCRYPTION_KEY = process.env.TOTP_SECRET_ENCRYPTION_KEY ?? '12345678901234567890123456789012';

// Tests should opt-in to Turnstile explicitly; root .env may set this for local dev.
delete process.env.TURNSTILE_SECRET_KEY;
