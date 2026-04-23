import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api';

interface RegisterResponse {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    address: '',
    placeOfBirth: '',
    dateOfBirth: '',
    gdprConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gdprConsent) {
      setError('You must consent to data processing to register.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.post<RegisterResponse>('/api/auth/register', form);
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Register</h1>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
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
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Registering…' : 'Create Account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
