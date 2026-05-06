import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

interface InvitePreview {
  id: string;
  token: string;
  email: string;
  role: 'MEMBER' | 'ADMIN';
  expiresAt: string;
  club: {
    id: string;
    name: string;
  };
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Missing invite token');
      return;
    }

    api.get<InvitePreview>(`/api/clubs/invites/${token}`)
      .then(setInvite)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptInvite() {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      const response = await api.post<{ message: string }>(`/api/clubs/invites/${token}/accept`, {});
      setSuccess(response.message ?? 'Invite accepted successfully');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <div className="auth-page" style={{ maxWidth: 560 }}>
      <div className="card">
        <h1>Accept Club Invite</h1>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {invite && !success && (
          <>
            <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
              You were invited to join <strong>{invite.club.name}</strong> as <strong>{invite.role}</strong>.
            </p>
            <p style={{ marginBottom: '1rem', color: 'var(--gray-600)' }}>
              Invite email: <strong>{invite.email}</strong><br />
              Expires: <strong>{new Date(invite.expiresAt).toLocaleString()}</strong>
            </p>
            <button className="btn btn-primary" onClick={acceptInvite} disabled={accepting}>
              {accepting ? 'Accepting…' : 'Accept Invite'}
            </button>
          </>
        )}

        {success && (
          <div style={{ marginTop: '1rem' }}>
            <Link to={`/clubs/${invite?.club.id ?? ''}`} className="btn btn-secondary btn-sm">
              Go to Club
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
