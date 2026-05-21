import speakeasy from 'speakeasy';

const ISSUER = 'Rifle Club Manager';

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
