import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

interface Member {
  id: string;
  userId: string;
  status: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    address?: string;
    placeOfBirth?: string;
    dateOfBirth?: string;
    firearmCertificateNumber?: string | null;
    firearmCertificateExpiry?: string | null;
    shotgunCertificateNumber?: string | null;
    shotgunCertificateExpiry?: string | null;
    gdprConsentDate?: string;
  };
}

export default function ClubMemberProfile() {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Member[]>(`/api/clubs/${id}/members`)
      .then(setMembers)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load member profile'))
      .finally(() => setLoading(false));
  }, [id]);

  const member = useMemo(() => members.find(m => m.userId === userId), [members, userId]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h1>Member Profile</h1>
        <Link to={`/clubs/${id}`} className="btn btn-secondary btn-sm">Back to Club</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!member && !error && (
        <div className="alert alert-info">Member not found for this club.</div>
      )}

      {member && (
        <section>
          <h2>{member.user.name}</h2>
          <table>
            <tbody>
              <tr>
                <th>Email</th>
                <td>{member.user.email}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>{member.status}</td>
              </tr>
              <tr>
                <th>Role</th>
                <td>{member.role}</td>
              </tr>
              <tr>
                <th>Address</th>
                <td>{member.user.address ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Place of Birth</th>
                <td>{member.user.placeOfBirth ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Date of Birth</th>
                <td>{member.user.dateOfBirth ? new Date(member.user.dateOfBirth).toLocaleDateString() : 'N/A'}</td>
              </tr>
              <tr>
                <th>Firearm Certificate #</th>
                <td>{member.user.firearmCertificateNumber ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Firearm Certificate Expiry</th>
                <td>{member.user.firearmCertificateExpiry ? new Date(member.user.firearmCertificateExpiry).toLocaleDateString() : 'N/A'}</td>
              </tr>
              <tr>
                <th>Shotgun Certificate #</th>
                <td>{member.user.shotgunCertificateNumber ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Shotgun Certificate Expiry</th>
                <td>{member.user.shotgunCertificateExpiry ? new Date(member.user.shotgunCertificateExpiry).toLocaleDateString() : 'N/A'}</td>
              </tr>
              <tr>
                <th>GDPR Consent Date</th>
                <td>{member.user.gdprConsentDate ? new Date(member.user.gdprConsentDate).toLocaleString() : 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
