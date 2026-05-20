import { getGoogleDriveOAuthConfig } from './googleDriveOAuthConfig';

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function assertGoogleDriveOAuthConfigured(): void {
  getGoogleDriveOAuthConfig();
}

export function buildGoogleDriveAuthUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleDriveOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(code: string): Promise<{
  refreshToken: string;
  scope?: string;
  expiryDate?: Date;
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleDriveOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to exchange OAuth code (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json() as {
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };

  if (!data.refresh_token) {
    throw new Error('Google OAuth response did not include a refresh_token');
  }

  return {
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiryDate: typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const body = new URLSearchParams({ token });
  await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => undefined);
}

