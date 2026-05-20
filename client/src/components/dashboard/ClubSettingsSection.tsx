import React from 'react';
import { ClubSettings, AmmunitionType, AmmunitionSafe, GoogleDriveBackupStatus, GoogleDriveFolderItem } from '../../types/club';

interface Props {
  settings: ClubSettings | null;
  editing: boolean;
  saving: boolean;
  form: ClubSettings;
  onToggleEdit: () => void;
  onSave: (e: React.FormEvent) => void;
  onFormChange: (partial: Partial<ClubSettings>) => void;
  ammunitionTypes: AmmunitionType[];
  ammunitionSafes: AmmunitionSafe[];
  newAmmunitionTypeName: string;
  newAmmunitionTypePricePence: number;
  newAmmunitionSafeName: string;
  onNewAmmunitionTypeNameChange: (value: string) => void;
  onNewAmmunitionTypePricePenceChange: (value: number) => void;
  onNewAmmunitionSafeNameChange: (value: string) => void;
  onCreateAmmunitionType: () => void;
  onCreateAmmunitionSafe: () => void;
  onUpdateAmmunitionTypePrice: (typeId: string, pricePence: number) => void;
  onUpdateAmmunitionTypeReorderConfig: (typeId: string, config: {
    reorderLevelQuantity: number | null;
    reorderQuantity: number | null;
    leadTimeDays: number | null;
    safetyStockDays: number | null;
  }) => void;
  onRenameSafe: (safeId: string, newName: string) => void;
  onDeleteSafe: (safeId: string) => void;
  googleDriveStatus: GoogleDriveBackupStatus | null;
  backupDriveFolderIdInput: string;
  backupDriveFolderName: string;
  backupActionLoading: boolean;
  onBackupDriveFolderIdInputChange: (value: string) => void;
  backupFolderPickerOpen: boolean;
  backupFolderPickerLoading: boolean;
  backupFolderPickerError: string;
  backupFolderPickerCurrentName: string;
  backupFolderPickerCanGoUp: boolean;
  backupFolderPickerItems: GoogleDriveFolderItem[];
  onOpenBackupFolderPicker: () => void;
  onCloseBackupFolderPicker: () => void;
  onOpenBackupFolder: (folderId: string) => void;
  onGoUpBackupFolder: () => void;
  onSelectBackupFolder: (folderId: string, folderName: string) => void;
  onStartGoogleDriveLink: () => void;
  onDisconnectGoogleDrive: () => void;
  onRefreshBackupStatus: () => void;
}

export default function ClubSettingsSection({
  settings,
  editing,
  saving,
  form,
  onToggleEdit,
  onSave,
  onFormChange,
  ammunitionTypes,
  ammunitionSafes,
  newAmmunitionTypeName,
  newAmmunitionTypePricePence,
  newAmmunitionSafeName,
  onNewAmmunitionTypeNameChange,
  onNewAmmunitionTypePricePenceChange,
  onNewAmmunitionSafeNameChange,
  onCreateAmmunitionType,
  onCreateAmmunitionSafe,
  onUpdateAmmunitionTypePrice,
  onUpdateAmmunitionTypeReorderConfig,
  onRenameSafe,
  onDeleteSafe,
  googleDriveStatus,
  backupDriveFolderIdInput: _backupDriveFolderIdInput,
  backupDriveFolderName,
  backupActionLoading,
  onBackupDriveFolderIdInputChange: _onBackupDriveFolderIdInputChange,
  backupFolderPickerOpen,
  backupFolderPickerLoading,
  backupFolderPickerError,
  backupFolderPickerCurrentName,
  backupFolderPickerCanGoUp,
  backupFolderPickerItems,
  onOpenBackupFolderPicker,
  onCloseBackupFolderPicker,
  onOpenBackupFolder,
  onGoUpBackupFolder,
  onSelectBackupFolder,
  onStartGoogleDriveLink,
  onDisconnectGoogleDrive,
  onRefreshBackupStatus,
}: Props) {
  return (
    <section>
      <div className="page-header">
        <h2>Club Settings</h2>
        <button className="btn btn-secondary btn-sm" onClick={onToggleEdit}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <form onSubmit={onSave}>
          <div className="form-group">
            <label>Logo URL</label>
            <input
              type="url"
              value={form.logoUrl || ''}
              onChange={e => onFormChange({ logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Primary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={e => onFormChange({ primaryColor: e.target.value })}
                />
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={e => onFormChange({ primaryColor: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Secondary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={e => onFormChange({ secondaryColor: e.target.value })}
                />
                <input
                  type="text"
                  value={form.secondaryColor}
                  onChange={e => onFormChange({ secondaryColor: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Accent Color</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={e => onFormChange({ accentColor: e.target.value })}
                />
                <input
                  type="text"
                  value={form.accentColor}
                  onChange={e => onFormChange({ accentColor: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Ammunition Usage Lookback (Days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.ammoSalesLookbackDays}
                onChange={e => onFormChange({ ammoSalesLookbackDays: Number(e.target.value || '30') })}
              />
            </div>

            <div className="form-group">
              <label>Default Lead Time (Days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.ammoDefaultLeadTimeDays}
                onChange={e => onFormChange({ ammoDefaultLeadTimeDays: Number(e.target.value || '14') })}
              />
            </div>

            <div className="form-group">
              <label>Default Safety Stock (Days)</label>
              <input
                type="number"
                min={0}
                max={365}
                value={form.ammoDefaultSafetyStockDays}
                onChange={e => onFormChange({ ammoDefaultSafetyStockDays: Number(e.target.value || '7') })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={form.passIssuingEnabled}
                  onChange={e => onFormChange({ passIssuingEnabled: e.target.checked })}
                />
                {' '}Pass Issuing Enabled
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={form.memberCardSignInEnabled}
                  onChange={e => onFormChange({ memberCardSignInEnabled: e.target.checked })}
                />
                {' '}Member Card Sign-In Enabled
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={form.backupEnabled}
                  onChange={e => onFormChange({ backupEnabled: e.target.checked })}
                />
                {' '}Nightly Google Drive Backups Enabled
              </label>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      ) : (
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem 1rem' }}>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Logo URL</dt>
          <dd>{settings?.logoUrl || 'Not set'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Primary Color</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '2rem', height: '2rem', backgroundColor: settings?.primaryColor, border: '1px solid #ddd', borderRadius: '4px' }} />
            {settings?.primaryColor}
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Secondary Color</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '2rem', height: '2rem', backgroundColor: settings?.secondaryColor, border: '1px solid #ddd', borderRadius: '4px' }} />
            {settings?.secondaryColor}
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Accent Color</dt>
          <dd style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '2rem', height: '2rem', backgroundColor: settings?.accentColor, border: '1px solid #ddd', borderRadius: '4px' }} />
            {settings?.accentColor}
          </dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Pass Issuing Enabled</dt>
          <dd>{settings?.passIssuingEnabled ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Member Card Sign-In Enabled</dt>
          <dd>{settings?.memberCardSignInEnabled ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Nightly Google Drive Backups Enabled</dt>
          <dd>{settings?.backupEnabled ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Ammo Usage Lookback</dt>
          <dd>{settings?.ammoSalesLookbackDays ?? 30} days</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Ammo Default Lead Time</dt>
          <dd>{settings?.ammoDefaultLeadTimeDays ?? 14} days</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Ammo Default Safety Stock</dt>
          <dd>{settings?.ammoDefaultSafetyStockDays ?? 7} days</dd>
        </dl>
      )}

      <section style={{ marginTop: '2rem' }}>
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h3>Google Drive Backups</h3>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onRefreshBackupStatus}>
            Refresh Status
          </button>
        </div>

        <div className="form-group">
          <label>Target Drive Folder</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={onOpenBackupFolderPicker}
              disabled={backupActionLoading || !googleDriveStatus?.connection?.linked}
            >
              Choose Folder
            </button>
            <span style={{ color: 'var(--gray-600)' }}>
              {backupDriveFolderName ? `Selected folder: ${backupDriveFolderName}` : 'No folder selected (auto-create managed folders)'}
            </span>
          </div>
        </div>

        {backupFolderPickerOpen && (
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <strong>Browsing: {backupFolderPickerCurrentName}</strong>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={onGoUpBackupFolder}
                disabled={backupFolderPickerLoading || !backupFolderPickerCanGoUp}
              >
                Up
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={onCloseBackupFolderPicker}
                disabled={backupFolderPickerLoading}
              >
                Close
              </button>
            </div>

            {backupFolderPickerError && (
              <div style={{ color: 'var(--danger-600)', marginBottom: '0.5rem' }}>{backupFolderPickerError}</div>
            )}

            {backupFolderPickerLoading ? (
              <div style={{ color: 'var(--gray-600)' }}>Loading folders…</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Folder</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupFolderPickerItems.map(folder => (
                    <tr key={folder.id}>
                      <td>{folder.name}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => onOpenBackupFolder(folder.id)}>
                          Open
                        </button>
                        <button className="btn btn-primary btn-sm" type="button" onClick={() => onSelectBackupFolder(folder.id, folder.name)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                  {backupFolderPickerItems.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: 'var(--gray-600)', textAlign: 'center' }}>No subfolders found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={onStartGoogleDriveLink}
            disabled={backupActionLoading}
          >
            {googleDriveStatus?.connection?.linked ? 'Reconnect Google Drive' : 'Link Google Drive'}
          </button>
          <button
            className="btn btn-danger btn-sm"
            type="button"
            onClick={onDisconnectGoogleDrive}
            disabled={backupActionLoading || !googleDriveStatus?.connection?.linked}
          >
            Disconnect
          </button>
        </div>

        <dl style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '0.5rem 1rem', marginBottom: '1rem' }}>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Connection Status</dt>
          <dd>{googleDriveStatus?.connection?.status ?? 'UNKNOWN'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Linked</dt>
          <dd>{googleDriveStatus?.connection?.linked ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Drive Folder</dt>
          <dd>{googleDriveStatus?.connection?.driveFolderName ?? 'Not set'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Linked At</dt>
          <dd>{googleDriveStatus?.connection?.linkedAt ? new Date(googleDriveStatus.connection.linkedAt).toLocaleString() : 'N/A'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Disconnected At</dt>
          <dd>{googleDriveStatus?.connection?.disconnectedAt ? new Date(googleDriveStatus.connection.disconnectedAt).toLocaleString() : 'N/A'}</dd>
        </dl>

        <h4>Last Run Status by Dataset</h4>
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(googleDriveStatus?.latestByDataset ?? {}).map(([dataset, run]) => (
              <tr key={dataset}>
                <td>{dataset}</td>
                <td>{run?.status ?? 'N/A'}</td>
                <td>{run?.startedAt ? new Date(run.startedAt).toLocaleString() : 'N/A'}</td>
                <td>{run?.finishedAt ? new Date(run.finishedAt).toLocaleString() : 'N/A'}</td>
                <td>{run?.error ?? ''}</td>
              </tr>
            ))}
            {Object.keys(googleDriveStatus?.latestByDataset ?? {}).length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                  No backup runs recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Ammunition Type & Price Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type Name</label>
            <input
              value={newAmmunitionTypeName}
              onChange={e => onNewAmmunitionTypeNameChange(e.target.value)}
              placeholder="e.g. .22LR"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Price Per Round (£)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={(newAmmunitionTypePricePence / 100).toFixed(2)}
              onChange={e => onNewAmmunitionTypePricePenceChange(Math.round(Number(e.target.value || '0') * 100))}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={onCreateAmmunitionType}>
            Add Type
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Current Price</th>
              <th>Update Price (£)</th>
              <th>Reorder Config</th>
              <th>Price History</th>
            </tr>
          </thead>
          <tbody>
            {ammunitionTypes.map(type => (
              <tr key={type.id}>
                <td>{type.name}</td>
                <td>£{(type.currentPricePence / 100).toFixed(2)}</td>
                <td>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => {
                      const raw = window.prompt(`Set new price for ${type.name} (GBP)`, (type.currentPricePence / 100).toFixed(2));
                      if (!raw) return;
                      const value = Math.round(Number(raw) * 100);
                      if (!Number.isFinite(value) || value < 0) return;
                      onUpdateAmmunitionTypePrice(type.id, value);
                    }}
                  >
                    Change
                  </button>
                </td>
                <td>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray-700)' }}>
                    Level: {type.reorderLevelQuantity ?? 'auto'} · Qty: {type.reorderQuantity ?? 'auto'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray-700)' }}>
                    Lead: {type.leadTimeDays ?? 'default'}d · Safety: {type.safetyStockDays ?? 'default'}d
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => {
                      const levelRaw = window.prompt(
                        `Reorder level quantity for ${type.name} (blank = auto)`,
                        type.reorderLevelQuantity != null ? String(type.reorderLevelQuantity) : '',
                      );
                      if (levelRaw === null) return;

                      const qtyRaw = window.prompt(
                        `Reorder quantity for ${type.name} (blank = auto)`,
                        type.reorderQuantity != null ? String(type.reorderQuantity) : '',
                      );
                      if (qtyRaw === null) return;

                      const leadRaw = window.prompt(
                        `Lead time days for ${type.name} (blank = club default)`,
                        type.leadTimeDays != null ? String(type.leadTimeDays) : '',
                      );
                      if (leadRaw === null) return;

                      const safetyRaw = window.prompt(
                        `Safety stock days for ${type.name} (blank = club default)`,
                        type.safetyStockDays != null ? String(type.safetyStockDays) : '',
                      );
                      if (safetyRaw === null) return;

                      const level = levelRaw.trim() === '' ? null : Number(levelRaw);
                      const qty = qtyRaw.trim() === '' ? null : Number(qtyRaw);
                      const lead = leadRaw.trim() === '' ? null : Number(leadRaw);
                      const safety = safetyRaw.trim() === '' ? null : Number(safetyRaw);

                      if (
                        (level !== null && (!Number.isFinite(level) || level <= 0))
                        || (qty !== null && (!Number.isFinite(qty) || qty <= 0))
                        || (lead !== null && (!Number.isFinite(lead) || lead <= 0))
                        || (safety !== null && (!Number.isFinite(safety) || safety < 0))
                      ) {
                        return;
                      }

                      onUpdateAmmunitionTypeReorderConfig(type.id, {
                        reorderLevelQuantity: level,
                        reorderQuantity: qty,
                        leadTimeDays: lead,
                        safetyStockDays: safety,
                      });
                    }}
                  >
                    Configure
                  </button>
                </td>
                <td>
                  {(type.priceHistory ?? []).slice(0, 5).map(history => (
                    <div key={history.id} style={{ fontSize: '0.85rem' }}>
                      £{(history.pricePence / 100).toFixed(2)} ({new Date(history.createdAt).toLocaleDateString()})
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {ammunitionTypes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                  No ammunition types configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Ammunition Safes</h3>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            value={newAmmunitionSafeName}
            onChange={e => onNewAmmunitionSafeNameChange(e.target.value)}
            placeholder="Safe name"
          />
          <button className="btn btn-primary" type="button" onClick={onCreateAmmunitionSafe}>
            Add Safe
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Safe Name</th>
              <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ammunitionSafes.map(safe => (
              <tr key={safe.id}>
                <td>{safe.name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    style={{ marginRight: '0.5rem' }}
                    onClick={() => {
                      const name = window.prompt('Rename safe:', safe.name);
                      if (!name || !name.trim() || name.trim() === safe.name) return;
                      onRenameSafe(safe.id, name.trim());
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Delete safe "${safe.name}"? This cannot be undone. Safes with existing sales or movement records cannot be deleted.`)) return;
                      onDeleteSafe(safe.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {ammunitionSafes.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No safes configured</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
