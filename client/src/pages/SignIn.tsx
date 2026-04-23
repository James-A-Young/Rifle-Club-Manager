import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface Firearm { id: string; make: string; model: string; caliber: string; }
interface Club { id: string; name: string; firearms: Firearm[]; }
interface LinkData { id: string; clubId: string; expiresAt: string; club: Club; }
interface UserFirearm { id: string; make: string; model: string; caliber: string; }

const PURPOSES = ['Practice', 'Competition', 'Training', 'Other'];

export default function SignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [userFirearms, setUserFirearms] = useState<UserFirearm[]>([]);
  const [form, setForm] = useState({
    clubId: '',
    purpose: 'Practice',
    firearmUsedId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      setError('You must be logged in to sign in to a club.');
      setLoading(false);
      return;
    }

    Promise.all([
      api.get<LinkData>(`/api/sign-in-links/${token}`),
      api.get<UserFirearm[]>('/api/users/me/firearms'),
    ])
      .then(([ld, uf]) => {
        setLinkData(ld);
        setUserFirearms(uf);
        setForm(f => ({ ...f, clubId: ld.clubId }));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Invalid or expired link'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/visits', {
        clubId: form.clubId,
        purpose: form.purpose,
        firearmUsedId: form.firearmUsedId || undefined,
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
    <div className="auth-page" style={{ maxWidth: 520 }}>
      <div className="card">
        <h1>Club Sign-In</h1>
        {linkData && <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem' }}>Signing in to: <strong>{linkData.club.name}</strong></p>}
        {error && <div className="alert alert-error">{error}</div>}
        {!user && (
          <div className="alert alert-info">
            Please <a href="/login">log in</a> before signing in to a club.
          </div>
        )}
        {user && linkData && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Your Name</label>
              <input value={user.name} disabled />
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
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Sign In to Club
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
