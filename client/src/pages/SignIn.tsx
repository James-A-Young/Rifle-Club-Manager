import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import VisitSignInForm, { VisitFormPayload } from '../components/VisitSignInForm';
import { SimpleFirearm } from '../types/club';

interface Club { id: string; name: string; firearms: SimpleFirearm[]; }
interface LinkData {
  id: string;
  clubId: string;
  cryptoToken: string;
  expiresAt: string;
  accessToken: string;
  accessTokenExpiresInMinutes: number;
  club: Club;
}

export default function SignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [linkData, setLinkData] = useState<LinkData | null>(null);
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

  async function handleSubmit(payload: VisitFormPayload) {
    setError('');
    try {
      await api.post('/api/visits/public', {
        signInAccessToken,
        ...payload,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing in');
      // Re-throw so VisitSignInForm keeps the form populated (doesn't reset on error)
      throw err;
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
        {linkData && (
          <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem' }}>
            Signing in to: <strong>{linkData.club.name}</strong>
          </p>
        )}

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
          <VisitSignInForm
            clubFirearms={clubFirearms}
            isAuthenticated={isAuthenticatedUser}
            onSubmit={handleSubmit}
            submitLabel="Sign In to Club"
          />
        )}
      </div>
    </div>
  );
}
