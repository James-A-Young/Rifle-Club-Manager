import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

const PURPOSES = ['Practice', 'Competition', 'Training', 'Other'];

const EMPTY_GUEST_DETAILS = {
  guestName: '',
  guestClubRepresented: '',
  guestEmail: '',
};

export default function SignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [form, setForm] = useState({
    purpose: 'Practice',
    firearmUsedId: '',
    firearmSerialNumber: '',
    guestDetails: EMPTY_GUEST_DETAILS,
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid or expired link');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload: {
        signInAccessToken: string;
        purpose: string;
        firearmUsedId?: string;
        firearmSerialNumber?: string;
        guestDetails?: typeof EMPTY_GUEST_DETAILS;
      } = {
        signInAccessToken,
        purpose: form.purpose,
        firearmUsedId: form.firearmUsedId || undefined,
        firearmSerialNumber: form.firearmSerialNumber || undefined,
      };

      // Only include guestDetails if user is not authenticated
      if (!user) {
        payload.guestDetails = form.guestDetails;
      }

      await api.post('/api/visits/public', payload);
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
  const isAuthenticatedUser = Boolean(user);

  return (
    <div className="auth-page" style={{ maxWidth: 640 }}>
      <div className="card">
        <h1>Club Sign-In</h1>
        {linkData && <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem' }}>Signing in to: <strong>{linkData.club.name}</strong></p>}

        {error && <div className="alert alert-error">{error}</div>}

        {!isAuthenticatedUser && (
          <div style={{ backgroundColor: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>
              <strong>Not signed in?</strong> Sign in to your account to have your details automatically populated.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/login?next=/sign-in/${token}`)}
              style={{ width: '100%' }}
            >
              Sign In to Your Account
            </button>
          </div>
        )}

        {linkData && (
          <form onSubmit={handleSubmit}>
            {!isAuthenticatedUser && (
              <>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={form.guestDetails.guestName}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestName: e.target.value },
                      }))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Club/Organization You Represent *</label>
                  <input
                    type="text"
                    value={form.guestDetails.guestClubRepresented}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestClubRepresented: e.target.value },
                      }))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address (optional)</label>
                  <input
                    type="email"
                    value={form.guestDetails.guestEmail}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestEmail: e.target.value },
                      }))
                    }
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Purpose of Visit *</label>
              <select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Firearm Used (optional)</label>
              <select value={form.firearmUsedId} onChange={e => setForm(f => ({ ...f, firearmUsedId: e.target.value }))}>
                <option value="">None / Not applicable</option>
                {clubFirearms.length > 0 && (
                  <optgroup label="Club Firearms">
                    {clubFirearms.map(f => (
                      <option key={f.id} value={f.id}>{f.make} {f.model} ({f.caliber})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Rifle Serial Number (optional)</label>
              <input
                type="text"
                value={form.firearmSerialNumber}
                onChange={e => setForm(f => ({ ...f, firearmSerialNumber: e.target.value }))}
                placeholder="Enter serial number if using personal rifle"
              />
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
