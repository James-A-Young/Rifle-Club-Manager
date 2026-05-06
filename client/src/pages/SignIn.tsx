import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Firearm { id: string; make: string; model: string; caliber: string; }
interface Club { id: string; name: string; firearms: Firearm[]; }
interface LinkData {
  id: string;
  clubId: string;
  cryptoToken: string;
  expiresAt: string;
  accessToken: string;
  accessTokenExpiresInMinutes: number;
  club: Club;
}
interface UserFirearm { id: string; make: string; model: string; caliber: string; }
interface UserProfile {
  id: string;
  name: string;
  email: string;
  address: string;
  placeOfBirth: string;
  dateOfBirth: string;
  gdprConsentDate: string;
}

const PURPOSES = ['Practice', 'Competition', 'Training', 'Other'];

const EMPTY_DETAILS = {
  name: '',
  email: '',
  address: '',
  placeOfBirth: '',
  dateOfBirth: '',
  gdprConsent: false,
};

export default function SignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [userFirearms, setUserFirearms] = useState<UserFirearm[]>([]);
  const [form, setForm] = useState({
    purpose: 'Practice',
    firearmUsedId: '',
    firearmSerialNumber: '',
    userDetails: EMPTY_DETAILS,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signInAccessToken, setSignInAccessToken] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const load = async () => {
      try {
        const ld = await api.get<LinkData>(`/api/sign-in-links/${token}`);
        setLinkData(ld);
        setSignInAccessToken(ld.accessToken);

        if (user) {
          const [profile, firearms] = await Promise.all([
            api.get<UserProfile>('/api/users/me'),
            api.get<UserFirearm[]>('/api/users/me/firearms'),
          ]);
          setUserFirearms(firearms);
          setForm(f => ({
            ...f,
            userDetails: {
              name: profile.name ?? '',
              email: profile.email ?? '',
              address: profile.address ?? '',
              placeOfBirth: profile.placeOfBirth ?? '',
              dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.split('T')[0] : '',
              gdprConsent: Boolean(profile.gdprConsentDate),
            },
          }));
        } else {
          setUserFirearms([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid or expired link');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/visits/public', {
        signInAccessToken,
        purpose: form.purpose,
        firearmUsedId: form.firearmUsedId || undefined,
        firearmSerialNumber: !user ? form.firearmSerialNumber || undefined : undefined,
        userDetails: form.userDetails,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing in');
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  if (success) {
    return (
      <div className="auth-page">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>✅ Signed In Successfully</h2>
          <p style={{ marginTop: '1rem', color: 'var(--gray-600)' }}>
            Welcome to {linkData?.club.name}. Enjoy your session!
          </p>
        </div>
      </div>
    );
  }

  const clubFirearms = linkData?.club.firearms ?? [];

  return (
    <div className="auth-page" style={{ maxWidth: 640 }}>
      <div className="card">
        <h1>Club Sign-In</h1>
        {linkData && <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem' }}>Signing in to: <strong>{linkData.club.name}</strong></p>}

        {error && <div className="alert alert-error">{error}</div>}

        {linkData && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                value={form.userDetails.name}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, name: e.target.value } }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={form.userDetails.email}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, email: e.target.value } }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input
                value={form.userDetails.address}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, address: e.target.value } }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Place of Birth</label>
              <input
                value={form.userDetails.placeOfBirth}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, placeOfBirth: e.target.value } }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                value={form.userDetails.dateOfBirth}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, dateOfBirth: e.target.value } }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Purpose of Visit</label>
              <select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Firearm Used (optional)</label>
              <select value={form.firearmUsedId} onChange={e => setForm(f => ({ ...f, firearmUsedId: e.target.value }))}>
                <option value="">None / Not applicable</option>
                {userFirearms.length > 0 && (
                  <optgroup label="Your Firearms">
                    {userFirearms.map(f => (
                      <option key={f.id} value={f.id}>{f.make} {f.model} ({f.caliber})</option>
                    ))}
                  </optgroup>
                )}
                {clubFirearms.length > 0 && (
                  <optgroup label="Club Firearms">
                    {clubFirearms.map(f => (
                      <option key={f.id} value={f.id}>{f.make} {f.model} ({f.caliber})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {!user && (
              <div className="form-group">
                <label>Rifle Serial Number (optional)</label>
                <input
                  value={form.firearmSerialNumber}
                  onChange={e => setForm(f => ({ ...f, firearmSerialNumber: e.target.value }))}
                  placeholder="Enter serial number if using personal rifle"
                />
              </div>
            )}
            <div className="form-group checkbox-group">
              <input
                id="gdprConsent"
                type="checkbox"
                checked={form.userDetails.gdprConsent}
                onChange={e => setForm(f => ({ ...f, userDetails: { ...f.userDetails, gdprConsent: e.target.checked } }))}
                required
              />
              <label htmlFor="gdprConsent" style={{ marginBottom: 0 }}>
                I consent to processing of my details for club sign-in records.
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Sign In to Club
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
