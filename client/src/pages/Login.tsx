import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';

interface InvitePreview {
  token: string;
  expiresAt: string;
  club: {
    id: string;
    name: string;
  };
}

export default function Login() {
  const { login, completeTwoFactorLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [inviteClubName, setInviteClubName] = useState('');
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);

  const nextPath = useMemo(() => {
    const next = searchParams.get('next')?.trim();
    return next && next.startsWith('/') ? next : '/';
  }, [searchParams]);

  const inviteTokenFromNext = useMemo(() => {
    const match = nextPath.match(/^\/invites\/([^/]+)\/accept$/);
    return match?.[1] ?? '';
  }, [nextPath]);

  const registerHref = useMemo(() => {
    const params = new URLSearchParams();
    if (nextPath !== '/') params.set('next', nextPath);
    if (inviteTokenFromNext) params.set('inviteToken', inviteTokenFromNext);
    const query = params.toString();
    return query ? `/register?${query}` : '/register';
  }, [nextPath, inviteTokenFromNext]);

  useEffect(() => {
    if (!inviteTokenFromNext) {
      setInviteClubName('');
      setInvitePreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setInvitePreviewLoading(true);
    setInviteClubName('');

    api.get<InvitePreview>(`/api/clubs/invite-preview/${encodeURIComponent(inviteTokenFromNext)}`, controller.signal)
      .then(preview => {
        setInviteClubName(preview.club.name);
      })
      .catch(() => {
        // Keep fallback message and do not block login.
      })
      .finally(() => {
        setInvitePreviewLoading(false);
      });

    return () => controller.abort();
  }, [inviteTokenFromNext]);

  async function handleSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await login(email, password);
      if (result.requiresTwoFactor) {
        setTwoFactorToken(result.twoFactorToken);
        setTwoFactorCode('');
        return;
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await completeTwoFactorLogin(twoFactorToken, twoFactorCode);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Two-factor verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLostAuthenticator(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setRecoverySuccess('');
    try {
      const result = await api.post<{ message?: string }>('/api/auth/2fa/recovery/request', {
        email: recoveryEmail.trim().toLowerCase(),
        password: recoveryPassword,
      });
      setRecoverySuccess(result.message ?? 'If the account is eligible, a recovery email has been sent.');
      setRecoveryPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start account recovery');
    } finally {
      setLoading(false);
    }
  }

  const inviteClubLabel = inviteClubName || 'this club';

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Sign In</h1>
        {inviteTokenFromNext && (
          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            Welcome! You have been invited to join {inviteClubLabel}. Please sign in, or register if you do not have an account.
            {invitePreviewLoading && ' Loading invite details...'}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {!twoFactorToken ? (
          <form onSubmit={handleSubmitCredentials}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <p style={{ marginTop: '-0.5rem', marginBottom: '1rem', textAlign: 'right', fontSize: '0.9rem' }}>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <>
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              Enter the 6-digit code from your authenticator app.
            </div>

            <form onSubmit={handleSubmitTwoFactor}>
              <div className="form-group">
                <label>Authenticator Code</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>
            </form>

            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => {
                setRecoveryEmail(email);
                setRecoveryPassword('');
                setRecoverySuccess('');
              }}>
                Lost Authenticator?
              </button>
            </div>

            <form onSubmit={handleLostAuthenticator} style={{ marginTop: '0.75rem' }} autoComplete="off">
              <div className="form-group">
                <label>Registered Email</label>
                <input
                  type="email"
                  autoComplete="off"
                  name="recovery-email"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  name="recovery-password"
                  value={recoveryPassword}
                  onChange={e => setRecoveryPassword(e.target.value)}
                  required
                />
              </div>
              {recoverySuccess && <div className="alert alert-success">{recoverySuccess}</div>}
              <button type="submit" className="btn btn-secondary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Sending…' : 'Send Recovery Email'}
              </button>
            </form>
          </>
        )}
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Don't have an account? <Link to={registerHref}>Register</Link>
        </p>
      </div>
    </div>
  );
}
