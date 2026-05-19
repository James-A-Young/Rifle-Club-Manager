import { google, drive_v3 } from 'googleapis';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function qEscape(value: string): string {
  return value.replace(/'/g, "\\'");
}

export class GoogleDriveBackupClient {
  private drive: drive_v3.Drive;

  constructor(refreshToken: string) {
    const oauth2 = new google.auth.OAuth2(
      requiredEnv('GOOGLE_DRIVE_OAUTH_CLIENT_ID'),
      requiredEnv('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET'),
      requiredEnv('GOOGLE_DRIVE_OAUTH_REDIRECT_URI')
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    this.drive = google.drive({ version: 'v3', auth: oauth2 });
  }

  async getOrCreateFolder(name: string, parentFolderId?: string): Promise<string> {
    const parentFilter = parentFolderId ? ` and '${qEscape(parentFolderId)}' in parents` : '';
    const query = [
      `name='${qEscape(name)}'`,
      `mimeType='application/vnd.google-apps.folder'`,
      'trashed=false',
    ].join(' and ') + parentFilter;

    const existing = await this.drive.files.list({
      q: query,
      fields: 'files(id,name)',
      pageSize: 1,
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
    });

    const first = existing.data.files?.[0];
    if (first?.id) {
      return first.id;
    }

    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId ? { parents: [parentFolderId] } : {}),
      },
      fields: 'id',
      supportsAllDrives: false,
    });

    if (!created.data.id) {
      throw new Error('Failed to create Google Drive folder');
    }
    return created.data.id;
  }

  async findCsvFileByName(name: string, folderId: string): Promise<string | null> {
    const query = [
      `name='${qEscape(name)}'`,
      `'${qEscape(folderId)}' in parents`,
      "mimeType='text/csv'",
      'trashed=false',
    ].join(' and ');

    const listed = await this.drive.files.list({
      q: query,
      fields: 'files(id,name)',
      pageSize: 1,
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
    });

    return listed.data.files?.[0]?.id ?? null;
  }

  async upsertCsvFile(name: string, folderId: string, csv: string, existingFileId?: string | null): Promise<string> {
    const media = {
      mimeType: 'text/csv',
      body: Buffer.from(csv, 'utf8'),
    };

    const fileId = existingFileId ?? await this.findCsvFileByName(name, folderId);
    if (fileId) {
      const updated = await this.drive.files.update({
        fileId,
        media,
        requestBody: { name, parents: [folderId] },
        fields: 'id',
        supportsAllDrives: false,
      });
      if (!updated.data.id) {
        throw new Error('Failed to update Google Drive file');
      }
      return updated.data.id;
    }

    const created = await this.drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: 'text/csv',
      },
      media,
      fields: 'id',
      supportsAllDrives: false,
    });
    if (!created.data.id) {
      throw new Error('Failed to create Google Drive file');
    }
    return created.data.id;
  }
}

