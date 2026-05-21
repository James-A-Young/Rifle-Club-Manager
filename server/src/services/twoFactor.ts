import speakeasy from 'speakeasy';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ISSUER = 'Rifle Club Manager';
const ENVELOPE_VERSION = 'v1';

function resolveEncryptionKey(): Buffer {
  const raw = process.env.TOTP_SECRET_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('TOTP_SECRET_ENCRYPTION_KEY is required');
  }

  const asBase64 = Buffer.from(raw, 'base64');
  if (asBase64.length === 32) {
    return asBase64;
  }

  const asUtf8 = Buffer.from(raw, 'utf8');
  if (asUtf8.length === 32) {
    return asUtf8;
  }

  throw new Error('TOTP_SECRET_ENCRYPTION_KEY must be 32-byte utf8 or base64-encoded 32-byte key');
}

export function encryptStoredTwoFactorSecret(secret: string): string {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [`enc`, ENVELOPE_VERSION, encrypted.toString('base64'), iv.toString('base64'), authTag.toString('base64')].join(':');
}

export function decryptStoredTwoFactorSecret(stored: string): string {
  if (!stored.startsWith('enc:')) {
    return stored;
  }

  const [marker, version, ciphertext, ivBase64, authTagBase64] = stored.split(':');
  if (marker !== 'enc' || version !== ENVELOPE_VERSION || !ciphertext || !ivBase64 || !authTagBase64) {
    throw new Error('Invalid encrypted TOTP secret format');
  }

  const key = resolveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function generateTwoFactorSecret(email: string): { secret: string; otpauthUrl: string } {
  const generated = speakeasy.generateSecret({
    name: `${ISSUER} (${email})`,
    issuer: ISSUER,
    length: 20,
  });
  const secret = generated.base32;
  const otpauthUrl = generated.otpauth_url ?? speakeasy.otpauthURL({
    secret,
    label: email,
    issuer: ISSUER,
    encoding: 'base32',
  });
  return { secret, otpauthUrl };
}

export function verifyTwoFactorCode(secret: string, code: string): boolean {
  return Boolean(speakeasy.totp.verify({
    secret,
    token: code,
    encoding: 'base32',
    window: 1,
  }));
}
