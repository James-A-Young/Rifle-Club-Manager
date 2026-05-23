import fs from 'node:fs';

type RawCredentialBlock = {
  client_id?: unknown;
  client_secret?: unknown;
  redirect_uri?: unknown;
  redirect_uris?: unknown;
};

export type GoogleDriveOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return trimmed(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const next = trimmed(item);
        if (next) {
          return next;
        }
      }
    }
  }

  return undefined;
}

function resolveCredentialBlock(parsed: unknown): RawCredentialBlock {
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const obj = parsed as Record<string, unknown>;
  const nested = obj.installed ?? obj.web;
  if (nested && typeof nested === 'object') {
    return nested as RawCredentialBlock;
  }

  return obj as RawCredentialBlock;
}

function loadGoogleDriveOAuthConfigFromJson(path: string): GoogleDriveOAuthConfig {
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const block = resolveCredentialBlock(parsed);

  const clientId = firstString(block.client_id);
  const clientSecret = firstString(block.client_secret);
  const redirectUri = firstString(block.redirect_uri) ?? firstString(block.redirect_uris);

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_DRIVE_CREDS_JSON_PATH does not contain client_id, client_secret, and redirect_uri(s)'
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function getGoogleDriveOAuthConfig(): GoogleDriveOAuthConfig {
  const envClientId = trimmed(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID);
  const envClientSecret = trimmed(process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET);
  const envRedirectUri = trimmed(process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI);

  if (envClientId && envClientSecret && envRedirectUri) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri,
    };
  }

  const credsPath = trimmed(process.env.GOOGLE_DRIVE_CREDS_JSON_PATH);
  if (credsPath) {
    try {
      return loadGoogleDriveOAuthConfigFromJson(credsPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Failed to load GOOGLE_DRIVE_CREDS_JSON_PATH: ${message}`);
    }
  }

  throw new Error(
    'Google Drive OAuth is not configured. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI or GOOGLE_DRIVE_CREDS_JSON_PATH'
  );
}