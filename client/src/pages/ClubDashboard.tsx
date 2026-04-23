import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import QRCodeDisplay from '../components/QRCodeDisplay';
import FirearmForm from '../components/FirearmForm';

interface Firearm { id: string; make: string; model: string; caliber: string; serialNumber: string; }
interface Club { id: string; name: string; homeOfficeRef?: string; }
interface Member { id: string; userId: string; status: string; role: string; user: { id: string; name: string; email: string; }; }
interface SignInLink { id: string; cryptoToken: string; expiresAt: string; }

export default function ClubDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [firearms, setFirearms] = useState<Firearm[]>([]);
  const [link, setLink] = useState<SignInLink | null>(null);
  const [showFirearmForm, setShowFirearmForm] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Club>(`/api/clubs/${id}`).then(setClub).catch(e => setError(e instanceof Error ? e.message : 'Error'));
    api.get<Member[]>(`/api/clubs/${id}/members`)
      .then(ms => {
        setMembers(ms);
        const me = ms.find(m => m.userId === user?.id);
        setIsAdmin(me?.role === 'ADMIN');
      })
      .catch(() => setIsAdmin(false));
  }, [id, user?.id]);

  async function approveMember(userId: string, status: 'APPROVED' | 'REJECTED') {
    if (!id) return;
    try {
      await api.patch(`/api/clubs/${id}/members/${userId}`, { status });
      const updated = await api.get<Member[]>(`/api/clubs/${id}/members`);
      setMembers(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function generateLink() {
    if (!id) return;
    try {
      const l = await api.post<SignInLink>('/api/sign-in-links', { clubId: id, expiresInHours: 24 });
      setLink(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generating link');
    }
  }

  async function addFirearm(data: { make: string; model: string; caliber: string; serialNumber: string }) {
    if (!id) return;
    const f = await api.post<Firearm>(`/api/clubs/${id}/firearms`, data);
    setFirearms(prev => [...prev, f]);
    setShowFirearmForm(false);
  }

  async function removeFirearm(firearmId: string) {
    if (!id) return;
    await api.delete(`/api/clubs/${id}/firearms/${firearmId}`);
    setFirearms(prev => prev.filter(f => f.id !== firearmId));
  }

  if (!club) return <div>Loading…</div>;

  const signInUrl = link ? `${window.location.origin}/sign-in/${link.cryptoToken}` : '';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{club.name}</h1>
          {club.homeOfficeRef && <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>Home Office Ref: {club.homeOfficeRef}</p>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {isAdmin && (
        <section>
          <div className="page-header">
            <h2>Sign-In Link / QR Code</h2>
            <button className="btn btn-primary btn-sm" onClick={generateLink}>Generate New Link</button>
          </div>
          {link && <QRCodeDisplay url={signInUrl} clubName={club.name} />}
        </section>
      )}

      <section>
        <div className="page-header">
          <h2>Members</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Role</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>
                  <span className={`badge badge-${m.status.toLowerCase()}`}>{m.status}</span>
                </td>
                <td>
                  <span className={`badge badge-${m.role.toLowerCase()}`}>{m.role}</span>
                </td>
                {isAdmin && (
                  <td>
                    {m.status === 'PENDING' && (
                      <div className="actions">
                        <button className="btn btn-success btn-sm" onClick={() => approveMember(m.userId, 'APPROVED')}>
                          Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => approveMember(m.userId, 'REJECTED')}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <section>
          <div className="page-header">
            <h2>Club Armory</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowFirearmForm(s => !s)}>
              Add Firearm
            </button>
          </div>
          {showFirearmForm && (
            <div style={{ marginBottom: '1rem' }}>
              <FirearmForm onSubmit={addFirearm} onCancel={() => setShowFirearmForm(false)} />
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Make</th>
                <th>Model</th>
                <th>Caliber</th>
                <th>Serial</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {firearms.map(f => (
                <tr key={f.id}>
                  <td>{f.make}</td>
                  <td>{f.model}</td>
                  <td>{f.caliber}</td>
                  <td>{f.serialNumber}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => removeFirearm(f.id)}>Remove</button>
                  </td>
                </tr>
              ))}
              {firearms.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No firearms registered</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
