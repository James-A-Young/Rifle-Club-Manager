import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    api.post<{ message?: string }>('/api/auth/email-verification/confirm', { token })
      .then(response => {
        setStatus('success');
        setMessage(response.message ?? 'Email verified successfully.');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Unable to verify email.');
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Email Verification</h1>
        {status === 'loading' && <div>Verifying your email…</div>}
        {status === 'success' && <div className="alert alert-success">{message}</div>}
        {status === 'error' && <div className="alert alert-error">{message}</div>}
        <p style={{ marginTop: '1rem' }}>
          <Link to="/login">Go to login</Link>
        </p>
      </div>
    </div>
  );
}
