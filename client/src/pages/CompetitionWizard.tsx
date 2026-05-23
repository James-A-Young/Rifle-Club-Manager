import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { CompetitionFormat, CompetitionType, CompetitionEventSummary } from '../types/club';

interface WizardState {
  name: string;
  format: CompetitionFormat;
  type: CompetitionType;
  owningClubId: string;
  owningUserId: string;
}

const INITIAL_STATE: WizardState = {
  name: '',
  format: 'LEAGUE',
  type: 'INDIVIDUAL',
  owningClubId: '',
  owningUserId: '',
};

export default function CompetitionWizard() {
  const navigate = useNavigate();
  const [form, setForm] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setField<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Competition name is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        format: form.format,
        type: form.type,
      };
      if (form.owningClubId.trim()) body.owningClubId = form.owningClubId.trim();
      if (form.owningUserId.trim()) body.owningUserId = form.owningUserId.trim();

      const event = await api.post<CompetitionEventSummary>('/api/competition-events', body);
      navigate(`/competitions/${event.id}/divisions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create competition');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '1.5rem', color: 'var(--navy)' }}>New Competition</h1>

      {error && (
        <div style={{ background: '#fee', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Name */}
        <div>
          <label style={labelStyle}>Competition Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. County League 2026"
            required
            style={inputStyle}
          />
        </div>

        {/* Format toggle */}
        <div>
          <label style={labelStyle}>Format</label>
          <div style={toggleGroupStyle}>
            {(['LEAGUE', 'KNOCKOUT'] as CompetitionFormat[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setField('format', f)}
                style={toggleBtnStyle(form.format === f)}
              >
                {f === 'LEAGUE' ? '⚖️ League' : '🏆 Knockout'}
              </button>
            ))}
          </div>
          <p style={hintStyle}>
            {form.format === 'LEAGUE'
              ? 'Divisions with round-robin fixtures. Bogey entries balance odd-numbered divisions.'
              : 'Single-elimination bracket with paired draw.'}
          </p>
        </div>

        {/* Type toggle */}
        <div>
          <label style={labelStyle}>Type</label>
          <div style={toggleGroupStyle}>
            {(['INDIVIDUAL', 'TEAM'] as CompetitionType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setField('type', t)}
                style={toggleBtnStyle(form.type === t)}
              >
                {t === 'INDIVIDUAL' ? '🎯 Individual' : '🏅 Team'}
              </button>
            ))}
          </div>
        </div>

        {/* Optional owning club */}
        <div>
          <label style={labelStyle}>Owning Club ID <span style={{ fontWeight: 400, color: 'var(--gray-600)' }}>(optional)</span></label>
          <input
            type="text"
            value={form.owningClubId}
            onChange={e => setField('owningClubId', e.target.value)}
            placeholder="Club ID if hosted by a club"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ ...btnStyle, background: 'var(--gray-200)', color: 'var(--gray-800)' }}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ ...btnStyle, background: 'var(--navy)', color: '#fff' }}>
            {saving ? 'Creating…' : 'Create & Set Up Divisions →'}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: '0.4rem',
  fontSize: '0.95rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.8rem',
  border: '1px solid var(--gray-400)',
  borderRadius: 'var(--radius)',
  fontSize: '1rem',
};

const hintStyle: React.CSSProperties = {
  marginTop: '0.4rem',
  fontSize: '0.82rem',
  color: 'var(--gray-600)',
};

const toggleGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '0.65rem 1rem',
    borderRadius: 'var(--radius)',
    border: `2px solid ${active ? 'var(--navy)' : 'var(--gray-400)'}`,
    background: active ? 'var(--navy)' : '#fff',
    color: active ? '#fff' : 'var(--gray-800)',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'all 0.15s',
  };
}

const btnStyle: React.CSSProperties = {
  padding: '0.65rem 1.5rem',
  borderRadius: 'var(--radius)',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.95rem',
};
