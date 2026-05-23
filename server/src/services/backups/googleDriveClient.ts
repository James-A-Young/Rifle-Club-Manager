import { google, drive_v3 } from 'googleapis';
import { getGoogleDriveOAuthConfig } from './googleDriveOAuthConfig.js';

function qEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveBackupClient {
  private drive: drive_v3.Drive;

  constructor(refreshToken: string) {
    const { clientId, clientSecret, redirectUri } = getGoogleDriveOAuthConfig();
    const oauth2 = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
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

  async listFolders(parentFolderId = 'root'): Promise<Array<{ id: string; name: string }>> {
    const query = [
      `mimeType='application/vnd.google-apps.folder'`,
      `'${qEscape(parentFolderId)}' in parents`,
      'trashed=false',
    ].join(' and ');

    const listed = await this.drive.files.list({
      q: query,
      fields: 'files(id,name)',
      orderBy: 'name_natural',
      pageSize: 200,
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
    });

    return (listed.data.files ?? [])
      .filter((file): file is { id: string; name: string } => Boolean(file.id && file.name))
      .map(file => ({ id: file.id, name: file.name }));
  }

  async getFolderMetadata(folderId: string): Promise<{ id: string; name: string; parentId: string | null } | null> {
    const file = await this.drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,parents,trashed',
      supportsAllDrives: false,
    });

    if (!file.data.id || !file.data.name) {
      return null;
    }
    if (file.data.trashed || file.data.mimeType !== 'application/vnd.google-apps.folder') {
      return null;
    }

    return {
      id: file.data.id,
      name: file.data.name,
      parentId: file.data.parents?.[0] ?? null,
    };
  }

  async upsertCsvFile(name: string, folderId: string, csv: string, existingFileId?: string | null): Promise<string> {
    const media = {
      mimeType: 'text/csv',
      body: csv,
    };

    const fileId = existingFileId ?? await this.findCsvFileByName(name, folderId);
    if (fileId) {
      const updated = await this.drive.files.update({
        fileId,
        media,
        requestBody: { name },
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
