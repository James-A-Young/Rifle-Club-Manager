/**
 * Centralized JWT configuration.
 *
 * Reads JWT_SECRET from the environment and fails fast at startup if it is
 * missing or too short. This prevents the server from starting with an
 * insecure default secret that would allow tokens to be forged.
 */

const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is not set. ' +
        'Generate a strong secret (≥32 chars) and set it before starting the server.'
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `FATAL: JWT_SECRET is too short (${secret.length} chars). ` +
        `Minimum required length is ${MIN_SECRET_LENGTH} characters.`
    );
  }

  return secret;
}

export const jwtSecret: string = resolveJwtSecret();
export const JWT_ACCESS_EXPIRES = '24h';
export const JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES = 20;
