import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ArmorySection from '../components/dashboard/ArmorySection';
import { Firearm } from '../types/club';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  address: string;
  placeOfBirth: string;
  dateOfBirth: string;
  phoneNumber: string;
  firearmCertificateNumber?: string | null;
  firearmCertificateExpiry?: string | null;
  shotgunCertificateNumber?: string | null;
  shotgunCertificateExpiry?: string | null;
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firearms, setFirearms] = useState<Firearm[]>([]);
  const [editing, setEditing] = useState(false);
  const [showFirearmForm, setShowFirearmForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    placeOfBirth: '',
    dateOfBirth: '',
    phoneNumber: '',
    firearmCertificateNumber: '',
    firearmCertificateExpiry: '',
    shotgunCertificateNumber: '',
    shotgunCertificateExpiry: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get<UserProfile>('/api/users/me').then(p => {
      setProfile(p);
      setForm({
        name: p.name,
        address: p.address,
        placeOfBirth: p.placeOfBirth,
        dateOfBirth: p.dateOfBirth.split('T')[0],
        phoneNumber: p.phoneNumber,
        firearmCertificateNumber: p.firearmCertificateNumber ?? '',
        firearmCertificateExpiry: p.firearmCertificateExpiry ? p.firearmCertificateExpiry.split('T')[0] : '',
        shotgunCertificateNumber: p.shotgunCertificateNumber ?? '',
        shotgunCertificateExpiry: p.shotgunCertificateExpiry ? p.shotgunCertificateExpiry.split('T')[0] : '',
      });
    });
    api.get<Firearm[]>('/api/users/me/firearms').then(setFirearms);
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const updated = await api.patch<UserProfile>('/api/users/me', form);
      setProfile(updated);
      setEditing(false);
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating profile');
    }
  }

  async function addFirearm(data: { make: string; model: string; caliber: string; serialNumber: string }) {
    const f = await api.post<Firearm>('/api/users/me/firearms', data);
    setFirearms(prev => [...prev, f]);
    setShowFirearmForm(false);
  }

  async function removeFirearm(id: string) {
    await api.delete(`/api/users/me/firearms/${id}`);
    setFirearms(prev => prev.filter(f => f.id !== id));
  }

  async function editFirearm(id: string, data: { make: string; model: string; caliber: string; serialNumber: string }) {
    const updated = await api.patch<Firearm>(`/api/users/me/firearms/${id}`, data);
    setFirearms(prev => prev.map(f => (f.id === id ? updated : f)));
  }

  if (!profile) return <div>Loading…</div>;

  return (
    <>
      <h1>Profile</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <section>
        <div className="page-header">
          <h2>Personal Information</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(e => !e)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <form onSubmit={saveProfile}>
            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Place of Birth</label>
              <input value={form.placeOfBirth} onChange={e => setForm(f => ({ ...f, placeOfBirth: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Firearm Certificate Number</label>
              <input
                value={form.firearmCertificateNumber}
                onChange={e => setForm(f => ({ ...f, firearmCertificateNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="form-group">
              <label>Firearm Certificate Expiry</label>
              <input
                type="date"
                value={form.firearmCertificateExpiry}
                onChange={e => setForm(f => ({ ...f, firearmCertificateExpiry: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Shotgun Certificate Number</label>
              <input
                value={form.shotgunCertificateNumber}
                onChange={e => setForm(f => ({ ...f, shotgunCertificateNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="form-group">
              <label>Shotgun Certificate Expiry</label>
              <input
                type="date"
                value={form.shotgunCertificateExpiry}
                onChange={e => setForm(f => ({ ...f, shotgunCertificateExpiry: e.target.value }))}
              />
            </div>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </form>
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.5rem 1rem' }}>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Name</dt>
            <dd>{profile.name}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Email</dt>
            <dd>{profile.email}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Address</dt>
            <dd>{profile.address}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Place of Birth</dt>
            <dd>{profile.placeOfBirth}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Date of Birth</dt>
            <dd>{new Date(profile.dateOfBirth).toLocaleDateString()}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Phone Number</dt>
            <dd>{profile.phoneNumber}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Firearm Certificate #</dt>
            <dd>{profile.firearmCertificateNumber ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Firearm Certificate Expiry</dt>
            <dd>{profile.firearmCertificateExpiry ? new Date(profile.firearmCertificateExpiry).toLocaleDateString() : 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Shotgun Certificate #</dt>
            <dd>{profile.shotgunCertificateNumber ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Shotgun Certificate Expiry</dt>
            <dd>{profile.shotgunCertificateExpiry ? new Date(profile.shotgunCertificateExpiry).toLocaleDateString() : 'N/A'}</dd>
          </dl>
        )}
      </section>

      <ArmorySection
        title="My Firearms"
        addButtonLabel="Add Firearm"
        emptyMessage="No firearms registered"
        firearms={firearms}
        showForm={showFirearmForm}
        onToggleForm={() => setShowFirearmForm(s => !s)}
        onAdd={addFirearm}
        onEdit={editFirearm}
        onRemove={removeFirearm}
      />
    </>
  );
}
