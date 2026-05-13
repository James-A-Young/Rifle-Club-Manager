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
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
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
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Don't have an account? <Link to={registerHref}>Register</Link>
        </p>
      </div>
    </div>
  );
}
