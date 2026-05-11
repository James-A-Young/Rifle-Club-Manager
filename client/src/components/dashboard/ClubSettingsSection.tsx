import React from 'react';
import { ClubSettings } from '../../types/club';

interface Props {
  settings: ClubSettings | null;
  editing: boolean;
  saving: boolean;
  form: ClubSettings;
  onToggleEdit: () => void;
  onSave: (e: React.FormEvent) => void;
  onFormChange: (partial: Partial<ClubSettings>) => void;
}

export default function ClubSettingsSection({
  settings,
  editing,
  saving,
  form,
  onToggleEdit,
  onSave,
  onFormChange,
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
    </section>
  );
}
