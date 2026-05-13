import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post<{ message?: string }>('/api/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });
      setSuccess(response.message ?? 'If the account exists, a password reset email has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request password reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Forgot Password</h1>
        <p style={{ color: 'var(--gray-600)', marginBottom: '1rem' }}>
          Enter your account email and we&apos;ll send a one-time reset link.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
