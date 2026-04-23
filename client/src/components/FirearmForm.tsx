import React, { useState } from 'react';

interface FirearmData {
  make: string;
  model: string;
  caliber: string;
  serialNumber: string;
}

interface Props {
  onSubmit: (data: FirearmData) => Promise<void>;
  onCancel: () => void;
}

export default function FirearmForm({ onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FirearmData>({ make: '', model: '', caliber: '', serialNumber: '' });
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
        <label>Make</label>
        <input value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label>Model</label>
        <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label>Caliber</label>
        <input value={form.caliber} onChange={e => setForm(f => ({ ...f, caliber: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label>Serial Number</label>
        <input value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} required />
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
