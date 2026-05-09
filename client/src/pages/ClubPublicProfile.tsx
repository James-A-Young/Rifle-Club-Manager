import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

interface ClubPublicProfileData {
  id: string;
  name: string;
  homeOfficeRef?: string | null;
  address?: string | null;
  disciplinesOffered?: string[] | null;
  acceptingNewMembers: boolean;
  openingTimes?: string | null;
  description?: string | null;
  createdAt: string;
  _count: {
    memberships: number;
  };
}

function normalizeDisciplines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0);
}

export default function ClubPublicProfile() {
  const { id } = useParams<{ id: string }>();
  const [club, setClub] = useState<ClubPublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Missing club id');
      setLoading(false);
      return;
    }

    api.get<ClubPublicProfileData>(`/api/clubs/profile/${id}`)
      .then(setClub)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load club profile'))
      .finally(() => setLoading(false));
  }, [id]);

  const disciplinesLabel = useMemo(() => normalizeDisciplines(club?.disciplinesOffered).join(', '), [club]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h1>{club?.name ?? 'Club Profile'}</h1>
        <Link to="/" className="btn btn-secondary btn-sm">Home</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {club && (
        <section>
          <table>
            <tbody>
              <tr>
                <th>Address</th>
                <td>{club.address ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Disciplines Offered</th>
                <td>{disciplinesLabel || 'N/A'}</td>
              </tr>
              <tr>
                <th>Accepting New Members</th>
                <td>{club.acceptingNewMembers ? 'Yes' : 'No'}</td>
              </tr>
              <tr>
                <th>Opening Times</th>
                <td>{club.openingTimes ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Description</th>
                <td>{club.description ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Home Office Reference</th>
                <td>{club.homeOfficeRef ?? 'N/A'}</td>
              </tr>
              <tr>
                <th>Members</th>
                <td>{club._count.memberships}</td>
              </tr>
              <tr>
                <th>Profile Created</th>
                <td>{new Date(club.createdAt).toLocaleDateString()}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
