import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, clearToken } from '../api';

export default function DisableTwoFactor() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function disableTwoFactor() {
    if (!token) {
      setError('Missing recovery token.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post<{ message?: string }>('/api/auth/2fa/recovery/disable', { token });
      clearToken();
      setSuccess(response.message ?? 'Two-factor authentication has been disabled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      return;
    }
    void disableTwoFactor();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Disable Two-Factor Authentication</h1>
        {!token && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            Missing recovery token.
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        {!success && (
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token} onClick={() => void disableTwoFactor()}>
            {loading ? 'Disabling…' : 'Disable 2FA'}
          </button>
        )}
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
