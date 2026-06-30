import React, { useState } from 'react';
import { FirearmFormData } from '../shared/firearms';

interface Props {
  onSubmit: (data: FirearmFormData) => Promise<void>;
  onCancel: () => void;
}

export default function FirearmForm({ onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FirearmFormData>({
    friendlyName: '',
    make: '',
    model: '',
    caliber: '',
    serialNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add firearm');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label htmlFor='friendlyName'>Friendly Name (optional)</label>
        <input
          id='friendlyName'
          value={form.friendlyName ?? ''}
          onChange={e => setForm(f => ({ ...f, friendlyName: e.target.value }))}
          placeholder="e.g. Match Rifle"
        />
      </div>
      <div className="form-group">
        <label htmlFor='make'>Make</label>
        <input id='make' value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label htmlFor='model'>Model</label>
        <input id='model' value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label htmlFor='caliber'>Caliber</label>
        <input id='caliber' value={form.caliber} onChange={e => setForm(f => ({ ...f, caliber: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label htmlFor='serialNumber'>Serial Number</label>
        <input id='serialNumber' value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} required />
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Add Firearm'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
