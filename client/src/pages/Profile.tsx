import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ArmorySection from '../components/dashboard/ArmorySection';
import Section21DeclarationHistory from '../components/Section21DeclarationHistory';
import Section21DeclarationViewModal from '../components/Section21DeclarationViewModal';
import Section21DeclarationRenewal from '../components/Section21DeclarationRenewal';
import { Firearm } from '../types/club';
import { QRCodeSVG } from 'qrcode.react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  address: string;
  placeOfBirth: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  disabilityStatus: 'NOT_DISABLED' | 'DISABLED' | 'PREFER_NOT_TO_SAY';
  guardianDeclarationAccepted: boolean;
  guardianFullName?: string | null;
  guardianPhoneNumber?: string | null;
  guardianDeclarationAt?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhoneNumber?: string | null;
  phoneNumber: string;
  twoFactorEnabled?: boolean;
  firearmCertificateNumber?: string | null;
  firearmCertificateExpiry?: string | null;
  shotgunCertificateNumber?: string | null;
  shotgunCertificateExpiry?: string | null;
  section21Status?: 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED';
  section21DeclarationSignedAt?: string | null;
}

function isUnder18(dateOfBirth: string): boolean {
  if (!dateOfBirth) {
    return false;
  }
  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age < 18;
}

function formatGender(value: UserProfile['gender'] | undefined): string {
  switch (value) {
    case 'MALE':
      return 'Male';
    case 'FEMALE':
      return 'Female';
    case 'NON_BINARY':
      return 'Non-binary';
    case 'OTHER':
      return 'Other';
    case 'PREFER_NOT_TO_SAY':
      return 'Prefer not to say';
    default:
      return 'Prefer not to say';
  }
}

function formatDisabilityStatus(value: UserProfile['disabilityStatus'] | undefined): string {
  switch (value) {
    case 'NOT_DISABLED':
      return 'Not disabled';
    case 'DISABLED':
      return 'Disabled';
    case 'PREFER_NOT_TO_SAY':
      return 'Prefer not to say';
    default:
      return 'Prefer not to say';
  }
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firearms, setFirearms] = useState<Firearm[]>([]);
  const [editing, setEditing] = useState(false);
  const [showFirearmForm, setShowFirearmForm] = useState(false);
  const [showDeclarationHistory, setShowDeclarationHistory] = useState(false);
  const [showDeclarationRenewal, setShowDeclarationRenewal] = useState(false);
  const [currentDeclaration, setCurrentDeclaration] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<null | {
    otpauthUrl: string;
    manualKey: string;
    expiresAt: string;
  }>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    placeOfBirth: '',
    dateOfBirth: '',
    gender: '',
    disabilityStatus: '',
    guardianDeclarationAccepted: false,
    guardianFullName: '',
    guardianPhoneNumber: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhoneNumber: '',
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
        gender: p.gender,
        disabilityStatus: p.disabilityStatus,
        guardianDeclarationAccepted: p.guardianDeclarationAccepted,
        guardianFullName: p.guardianFullName ?? '',
        guardianPhoneNumber: p.guardianPhoneNumber ?? '',
        emergencyContactName: p.emergencyContactName ?? '',
        emergencyContactRelation: p.emergencyContactRelation ?? '',
        emergencyContactPhoneNumber: p.emergencyContactPhoneNumber ?? '',
        phoneNumber: p.phoneNumber,
        firearmCertificateNumber: p.firearmCertificateNumber ?? '',
        firearmCertificateExpiry: p.firearmCertificateExpiry ? p.firearmCertificateExpiry.split('T')[0] : '',
        shotgunCertificateNumber: p.shotgunCertificateNumber ?? '',
        shotgunCertificateExpiry: p.shotgunCertificateExpiry ? p.shotgunCertificateExpiry.split('T')[0] : '',
      });
    });
    api.get<any>('/api/users/me/section21-declaration').then(setCurrentDeclaration).catch(() => {});
    api.get<Firearm[]>('/api/users/me/firearms').then(setFirearms);
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const requiresGuardianDeclaration = isUnder18(form.dateOfBirth);

    if (requiresGuardianDeclaration) {
      if (!form.guardianDeclarationAccepted) {
        setError('For members under 18, a parent or guardian must declare permission to shoot and use the system.');
        return;
      }
      if (!form.guardianFullName.trim()) {
        setError('For members under 18, parent or guardian full name is required.');
        return;
      }
      if (!form.guardianPhoneNumber.trim()) {
        setError('For members under 18, parent or guardian phone number is required.');
        return;
      }
    }

    if (!form.emergencyContactName.trim()) {
      setError('Emergency contact name is required.');
      return;
    }
    if (!form.emergencyContactRelation.trim()) {
      setError('Emergency contact relation is required.');
      return;
    }
    if (!form.emergencyContactPhoneNumber.trim()) {
      setError('Emergency contact phone number is required.');
      return;
    }

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

  async function startTwoFactorSetup() {
    setTwoFactorLoading(true);
    setError('');
    setSuccess('');
    try {
      const setup = await api.post<{ otpauthUrl: string; manualKey: string; expiresAt: string }>('/api/users/me/2fa/setup/start', {});
      setTwoFactorSetup(setup);
      setTwoFactorCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setTwoFactorLoading(false);
    }
  }

  async function verifyTwoFactorSetup(e: React.FormEvent) {
    e.preventDefault();
    setTwoFactorLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/users/me/2fa/setup/verify', { code: twoFactorCode });
      const refreshed = await api.get<UserProfile>('/api/users/me');
      setProfile(refreshed);
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      setSuccess('Two-factor authentication enabled successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify 2FA code');
    } finally {
      setTwoFactorLoading(false);
    }
  }

  async function removeFirearm(id: string) {
    await api.delete(`/api/users/me/firearms/${id}`);
    setFirearms(prev => prev.filter(f => f.id !== id));
  }

  async function editFirearm(id: string, data: { make: string; model: string; caliber: string; serialNumber: string }) {
    const updated = await api.patch<Firearm>(`/api/users/me/firearms/${id}`, data);
    setFirearms(prev => prev.map(f => (f.id === id ? updated : f)));
  }

  async function toggleFavoriteFirearm(id: string, isFavorite: boolean) {
    const updated = await api.patch<Firearm>(`/api/users/me/firearms/${id}/favorite`, { isFavorite });
    setFirearms(prev => prev.map(f => (f.id === id ? updated : f)));
  }


  async function handleViewDeclaration(declarationId?: string) {
    if (declarationId && currentDeclaration?.id !== declarationId) {
      try {
        const fullDeclaration = await api.get<any>(`/api/users/me/section21-declarations/${declarationId}`);
        setCurrentDeclaration(fullDeclaration);
      } catch (err) {
        console.error('Failed to load declaration:', err);
        return;
      }
    }
    setShowViewModal(true);
  }
  function getStatusBadgeColor(status?: string) {
    switch (status) {
      case 'SIGNED':
        return '#10b981'; // green
      case 'EXPIRED':
        return '#ef4444'; // red
      case 'PENDING_RENEWAL':
        return '#f59e0b'; // amber
      default:
        return '#6b7280'; // gray
    }
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
              <label>Gender</label>
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} required>
                <option value="" disabled>Select your gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="NON_BINARY">Non-binary</option>
                <option value="OTHER">Other</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </div>
            <div className="form-group">
              <label>Disability Status</label>
              <select value={form.disabilityStatus} onChange={e => setForm(f => ({ ...f, disabilityStatus: e.target.value }))} required>
                <option value="" disabled>Select disability status</option>
                <option value="NOT_DISABLED">Not disabled</option>
                <option value="DISABLED">Disabled</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </div>
            {isUnder18(form.dateOfBirth) && (
              <>
                <div className="form-group">
                  <label>Parent or Guardian Full Name</label>
                  <input
                    value={form.guardianFullName}
                    onChange={e => setForm(f => ({ ...f, guardianFullName: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Parent or Guardian Phone Number</label>
                  <input
                    type="tel"
                    value={form.guardianPhoneNumber}
                    onChange={e => setForm(f => ({ ...f, guardianPhoneNumber: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="profile-guardian-permission"
                      checked={form.guardianDeclarationAccepted}
                      onChange={e => setForm(f => ({ ...f, guardianDeclarationAccepted: e.target.checked }))}
                      required
                    />
                    <label htmlFor="profile-guardian-permission">
                      Parent or legal guardian declaration: permission is granted for this member to shoot and use the system.
                    </label>
                  </div>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Phone Number</label>
              <input value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} required />
            </div>
            <h3 style={{ fontSize: '1rem', margin: '1rem 0 0.75rem' }}>Emergency Contact</h3>
            <div className="form-group">
              <label>Emergency Contact Name</label>
              <input
                value={form.emergencyContactName}
                onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Relation</label>
              <input
                value={form.emergencyContactRelation}
                onChange={e => setForm(f => ({ ...f, emergencyContactRelation: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Emergency Contact Phone Number</label>
              <input
                type="tel"
                value={form.emergencyContactPhoneNumber}
                onChange={e => setForm(f => ({ ...f, emergencyContactPhoneNumber: e.target.value }))}
                required
              />
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
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Gender</dt>
            <dd>{formatGender(profile.gender)}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Disability Status</dt>
            <dd>{formatDisabilityStatus(profile.disabilityStatus)}</dd>
            {isUnder18(profile.dateOfBirth) && (
              <>
                <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Guardian Declaration</dt>
                <dd>{profile.guardianDeclarationAccepted ? 'Accepted' : 'Not provided'}</dd>
                <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Parent or Guardian Name</dt>
                <dd>{profile.guardianFullName ?? 'N/A'}</dd>
                <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Parent or Guardian Phone</dt>
                <dd>{profile.guardianPhoneNumber ?? 'N/A'}</dd>
              </>
            )}
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Phone Number</dt>
            <dd>{profile.phoneNumber}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Emergency Contact Name</dt>
            <dd>{profile.emergencyContactName ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Emergency Contact Relation</dt>
            <dd>{profile.emergencyContactRelation ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Emergency Contact Phone</dt>
            <dd>{profile.emergencyContactPhoneNumber ?? 'N/A'}</dd>
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

      <section>
        <div className="page-header">
          <h2>Two-Factor Authentication</h2>
        </div>

        {profile.twoFactorEnabled ? (
          <div className="alert alert-success">Authenticator-based 2FA is enabled for your account.</div>
        ) : (
          <>
            <p style={{ color: 'var(--gray-600)', marginBottom: '0.75rem' }}>
              Protect your account with an authenticator app (TOTP).
            </p>
            {!twoFactorSetup ? (
              <button className="btn btn-primary" onClick={() => void startTwoFactorSetup()} disabled={twoFactorLoading}>
                {twoFactorLoading ? 'Preparing…' : 'Set Up Authenticator App'}
              </button>
            ) : (
              <div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <QRCodeSVG value={twoFactorSetup.otpauthUrl} size={180} includeMargin />
                </div>
                <p style={{ marginBottom: '0.5rem' }}>
                  If you can&apos;t scan the QR code, enter this setup key manually:
                </p>
                <p style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.04em' }}>{twoFactorSetup.manualKey}</p>
                <p style={{ color: 'var(--gray-600)' }}>
                  Setup expires at {new Date(twoFactorSetup.expiresAt).toLocaleTimeString()}.
                </p>

                <form onSubmit={verifyTwoFactorSetup}>
                  <div className="form-group">
                    <label>Enter 6-digit code from your app</label>
                    <input
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={twoFactorCode}
                      onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      required
                    />
                  </div>
                  <div className="actions">
                    <button className="btn btn-primary" type="submit" disabled={twoFactorLoading}>
                      {twoFactorLoading ? 'Verifying…' : 'Enable 2FA'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        setTwoFactorSetup(null);
                        setTwoFactorCode('');
                      }}
                      disabled={twoFactorLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <div className="page-header">
          <h2>Section 21 Firearms Act Declaration</h2>
          {profile.section21Status && (
            <span
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                backgroundColor: getStatusBadgeColor(profile.section21Status) + '20',
                color: getStatusBadgeColor(profile.section21Status),
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
              }}
            >
              {profile.section21Status}
            </span>
          )}
        </div>

        {profile.section21Status === 'NOT_DECLARED' ? (
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            You have not yet completed the mandatory Section 21 declaration. Please complete this declaration to access firearms facilities.
          </p>
        ) : (
          <>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              {profile.section21DeclarationSignedAt ? (
                <>
                  Signed: <strong>{new Date(profile.section21DeclarationSignedAt).toLocaleDateString('en-GB')}</strong>
                  {profile.section21Status === 'PENDING_RENEWAL' && (
                    <span style={{ color: '#f59e0b', fontWeight: '600', marginLeft: '1rem' }}>
                      ⚠️ Renewal due soon
                    </span>
                  )}
                  {profile.section21Status === 'EXPIRED' && (
                    <span style={{ color: '#ef4444', fontWeight: '600', marginLeft: '1rem' }}>
                      ⚠️ Renewal overdue
                    </span>
                  )}
                </>
              ) : null}
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowDeclarationHistory(!showDeclarationHistory)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#e5e7eb',
                  color: '#1f2937',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                {showDeclarationHistory ? 'Hide' : 'View'} History
              </button>
              {(profile.section21Status === 'EXPIRED' || profile.section21Status === 'PENDING_RENEWAL') && (
                <button
                  onClick={() => setShowDeclarationRenewal(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Renew Now
                </button>
              )}
            </div>

            {showDeclarationHistory && (
              <div style={{ marginTop: '20px' }}>
                <Section21DeclarationHistory onViewClick={handleViewDeclaration} />
              </div>
            )}
          </>
        )}
      </section>

      <Section21DeclarationViewModal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        declaration={currentDeclaration}
      />

      <Section21DeclarationRenewal
        isOpen={showDeclarationRenewal}
        onClose={() => {
          setShowDeclarationRenewal(false);
          // Refresh profile to get updated status
          api.get<UserProfile>('/api/users/me').then(setProfile);
        }}
        onSuccess={() => {
          setSuccess('Declaration renewed successfully');
          api.get<UserProfile>('/api/users/me').then(setProfile);
        }}
      />

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
        onToggleFavorite={toggleFavoriteFirearm}
      />
    </>
  );
}
