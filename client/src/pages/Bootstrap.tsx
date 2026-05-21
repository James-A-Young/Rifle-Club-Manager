import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useConfig } from '../context/ConfigContext';
import GdprPolicyModal from '../components/GdprPolicyModal';

interface BootstrapResponse {
  token: string;
  user: { id: string; name: string; email: string };
  club: { id: string; name: string };
}

export default function Bootstrap() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { clientOrigin } = useConfig();
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    address: '',
    placeOfBirth: '',
    dateOfBirth: '',
    phoneNumber: '',
    gdprConsent: false,
    clubName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
      return;
    }
    api.get<{ bootstrapAvailable: boolean }>('/api/auth/bootstrap-status')
      .then(data => {
        setAvailable(data.bootstrapAvailable);
        if (!data.bootstrapAvailable) {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setChecking(false));
  }, [user, navigate]);

  function update(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gdprConsent) {
      setError('You must consent to data processing to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.post<BootstrapResponse>('/api/auth/bootstrap', form);
      setToken(data.token);
      // Reload auth state and navigate to the club dashboard
      await login(form.email, form.password);
      navigate(`/clubs/${data.club.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!available) return null;

  return (
    <div className="auth-page">
      <div className="card">
        <h1>First-Time Setup</h1>
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          No users exist yet. Create your admin account and first club to get started.
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Your Account</h2>
          <div className="form-group">
            <label>Full Name</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={8} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={e => update('address', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Place of Birth</label>
            <input value={form.placeOfBirth} onChange={e => update('placeOfBirth', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input type="date" value={form.dateOfBirth} onChange={e => update('dateOfBirth', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input type="tel" value={form.phoneNumber} onChange={e => update('phoneNumber', e.target.value)} required />
          </div>
          <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.75rem' }}>Your Club</h2>
          <div className="form-group">
            <label>Club Name</label>
            <input value={form.clubName} onChange={e => update('clubName', e.target.value)} required />
          </div>
          <div className="form-group">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="gdpr"
                checked={form.gdprConsent}
                onChange={e => update('gdprConsent', e.target.checked)}
              />
              <label htmlFor="gdpr">
                I consent to the processing of my personal data in accordance with GDPR regulations.
              </label>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Read the GDPR policy before continuing:{' '}
              <button type="button" className="link-button" onClick={() => setPolicyOpen(true)}>
                View Privacy Policy
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Setting up…' : 'Create Admin Account & Club'}
          </button>
        </form>
      </div>
      <GdprPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} clientOrigin={clientOrigin} />
    </div>
  );
}
