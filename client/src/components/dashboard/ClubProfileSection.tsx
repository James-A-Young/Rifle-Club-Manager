import React from 'react';
import { normalizeDisciplines } from '../../shared/clubUtils';
import { Club, ClubFormData } from '../../types/club';

interface Props {
  club: Club;
  isAdmin: boolean;
  editing: boolean;
  saving: boolean;
  form: ClubFormData;
  disciplineInput: string;
  onToggleEdit: () => void;
  onSave: (e: React.FormEvent) => void;
  onFormChange: (partial: Partial<ClubFormData>) => void;
  onDisciplineInputChange: (value: string) => void;
  onAddDiscipline: () => void;
  onRemoveDiscipline: (discipline: string) => void;
}

export default function ClubProfileSection({
  club,
  isAdmin,
  editing,
  saving,
  form,
  disciplineInput,
  onToggleEdit,
  onSave,
  onFormChange,
  onDisciplineInputChange,
  onAddDiscipline,
  onRemoveDiscipline,
}: Props) {
  return (
    <section>
      <div className="page-header">
        <h2>Club Profile</h2>
        {isAdmin && (
          <button className="btn btn-secondary btn-sm" onClick={onToggleEdit}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={onSave}>
          <div className="form-group">
            <label>Club Name</label>
            <input
              value={form.name}
              onChange={e => onFormChange({ name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Home Office Reference</label>
            <input
              value={form.homeOfficeRef}
              onChange={e => onFormChange({ homeOfficeRef: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input
              value={form.address}
              onChange={e => onFormChange({ address: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Disciplines Offered</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={disciplineInput}
                onChange={e => onDisciplineInputChange(e.target.value)}
                placeholder="Type a discipline and click Add"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddDiscipline();
                  }
                }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={onAddDiscipline}>
                Add
              </button>
            </div>
            <div className="actions" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {form.disciplinesOffered.map(discipline => (
                <button
                  key={discipline}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRemoveDiscipline(discipline)}
                >
                  {discipline} ×
                </button>
              ))}
              {form.disciplinesOffered.length === 0 && (
                <span style={{ color: 'var(--gray-600)' }}>No disciplines added</span>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Accepting New Members</label>
            <select
              value={form.acceptingNewMembers ? 'yes' : 'no'}
              onChange={e => onFormChange({ acceptingNewMembers: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="form-group">
            <label>Opening Times</label>
            <input
              value={form.openingTimes}
              onChange={e => onFormChange({ openingTimes: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => onFormChange({ description: e.target.value })}
              rows={4}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Club Profile'}
          </button>
        </form>
      ) : (
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem 1rem' }}>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Address</dt>
          <dd>{club.address ?? 'N/A'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Disciplines Offered</dt>
          <dd>{normalizeDisciplines(club.disciplinesOffered).join(', ') || 'N/A'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Accepting New Members</dt>
          <dd>{club.acceptingNewMembers ? 'Yes' : 'No'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Opening Times</dt>
          <dd>{club.openingTimes ?? 'N/A'}</dd>
          <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Description</dt>
          <dd>{club.description ?? 'N/A'}</dd>
        </dl>
      )}
    </section>
  );
}
