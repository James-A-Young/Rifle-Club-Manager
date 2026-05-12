import React from 'react';
import { ClubSettings, AmmunitionType, AmmunitionSafe } from '../../types/club';

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
  onRenameSafe: (safeId: string, newName: string) => void;
  onDeleteSafe: (safeId: string) => void;
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
  onRenameSafe,
  onDeleteSafe,
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
        </dl>
      )}

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
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
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
