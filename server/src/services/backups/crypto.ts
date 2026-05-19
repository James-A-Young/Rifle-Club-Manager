import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function resolveEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY is required');
  }

  const asBase64 = Buffer.from(raw, 'base64');
  if (asBase64.length === 32) {
    return asBase64;
  }

  const asUtf8 = Buffer.from(raw, 'utf8');
  if (asUtf8.length === 32) {
    return asUtf8;
  }

  throw new Error('GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be 32-byte utf8 or base64-encoded 32-byte key');
}

export function encryptSecret(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(ciphertext: string, ivBase64: string, authTagBase64: string): string {
  const key = resolveEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(ciphertext, 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

