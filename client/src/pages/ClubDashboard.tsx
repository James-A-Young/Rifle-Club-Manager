import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import FirearmForm from '../components/FirearmForm';

interface Firearm { id: string; make: string; model: string; caliber: string; serialNumber: string; }
interface Club {
  id: string;
  name: string;
  homeOfficeRef?: string | null;
  address?: string | null;
  disciplinesOffered?: string[] | null;
  acceptingNewMembers: boolean;
  openingTimes?: string | null;
  description?: string | null;
}
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
interface SignInLink { id: string; cryptoToken: string; expiresAt: string; mode?: 'KIOSK' | 'QR'; }
interface ClubInvite {
  id: string;
  email: string;
  role: 'MEMBER' | 'ADMIN';
  token: string;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

function normalizeDisciplines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(item => item.length > 0);
}

export default function ClubDashboard() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [firearms, setFirearms] = useState<Firearm[]>([]);
  const [links, setLinks] = useState<SignInLink[]>([]);
  const [invites, setInvites] = useState<ClubInvite[]>([]);
  const [showFirearmForm, setShowFirearmForm] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingClubProfile, setEditingClubProfile] = useState(false);
  const [savingClubProfile, setSavingClubProfile] = useState(false);
  const [disciplineInput, setDisciplineInput] = useState('');
  const [clubForm, setClubForm] = useState({
    name: '',
    homeOfficeRef: '',
    address: '',
    disciplinesOffered: [] as string[],
    acceptingNewMembers: true,
    openingTimes: '',
    description: '',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(14);
  const [editingRole, setEditingRole] = useState<{ userId: string; role: 'MEMBER' | 'ADMIN' } | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Club>(`/api/clubs/${id}`).then(clubData => {
      setClub(clubData);
      setClubForm({
        name: clubData.name,
        homeOfficeRef: clubData.homeOfficeRef ?? '',
        address: clubData.address ?? '',
        disciplinesOffered: normalizeDisciplines(clubData.disciplinesOffered),
        acceptingNewMembers: clubData.acceptingNewMembers ?? true,
        openingTimes: clubData.openingTimes ?? '',
        description: clubData.description ?? '',
      });
    }).catch(e => setError(e instanceof Error ? e.message : 'Error'));
    api.get<Member[]>(`/api/clubs/${id}/members`)
      .then(ms => {
        setMembers(ms);
        const me = ms.find(m => m.userId === user?.id);
        setIsAdmin(me?.role === 'ADMIN');
      })
      .catch(() => setIsAdmin(false));
  }, [id, user?.id]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    api.get<SignInLink[]>(`/api/sign-in-links/club/${id}`)
      .then(setLinks)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading links'));
    api.get<ClubInvite[]>(`/api/clubs/${id}/invites`)
      .then(setInvites)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading invites'));
  }, [id, isAdmin]);

  const inviteBaseUrl = useMemo(() => `${window.location.origin}/invites`, []);

  function addDiscipline() {
    const value = disciplineInput.trim();
    if (!value) return;
    setClubForm(prev => {
      if (prev.disciplinesOffered.includes(value)) return prev;
      return {
        ...prev,
        disciplinesOffered: [...prev.disciplinesOffered, value],
      };
    });
    setDisciplineInput('');
  }

  function removeDiscipline(discipline: string) {
    setClubForm(prev => ({
      ...prev,
      disciplinesOffered: prev.disciplinesOffered.filter(item => item !== discipline),
    }));
  }

  async function saveClubProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingClubProfile(true);
    setError('');
    try {
      const updated = await api.patch<Club>(`/api/clubs/${id}`, {
        name: clubForm.name,
        homeOfficeRef: clubForm.homeOfficeRef,
        address: clubForm.address,
        disciplinesOffered: clubForm.disciplinesOffered,
        acceptingNewMembers: clubForm.acceptingNewMembers,
        openingTimes: clubForm.openingTimes,
        description: clubForm.description,
      });
      setClub(updated);
      setClubForm({
        name: updated.name,
        homeOfficeRef: updated.homeOfficeRef ?? '',
        address: updated.address ?? '',
        disciplinesOffered: normalizeDisciplines(updated.disciplinesOffered),
        acceptingNewMembers: updated.acceptingNewMembers,
        openingTimes: updated.openingTimes ?? '',
        description: updated.description ?? '',
      });
      setEditingClubProfile(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating club profile');
    } finally {
      setSavingClubProfile(false);
    }
  }

  async function approveMember(userId: string, status: 'APPROVED' | 'REJECTED') {
    if (!id) return;
    try {
      const updated = await api.patch<Member>(`/api/clubs/${id}/members/${userId}`, { status });
      setMembers(members.map(m => (m.userId === userId ? updated : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating member');
    }
  }

  async function saveRoleChange(userId: string, newRole: 'MEMBER' | 'ADMIN') {
    if (!id || !editingRole) return;
    setSavingRole(true);
    setError('');
    try {
      const updated = await api.patch<Member>(`/api/clubs/${id}/members/${userId}`, {
        role: newRole,
      });
      setMembers(members.map(m => (m.userId === userId ? updated : m)));
      setEditingRole(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating member role');
    } finally {
      setSavingRole(false);
    }
  }

  async function generateKioskLink() {
    if (!id) return;
    try {
      const l = await api.post<SignInLink>('/api/sign-in-links/kiosk', { clubId: id });
      setLinks(prev => [{ ...l, mode: 'KIOSK' }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generating kiosk link');
    }
  }

  async function revokeLink(linkId: string) {
    try {
      await api.delete(`/api/sign-in-links/${linkId}`);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error revoking link');
    }
  }

  async function createInvite() {
    if (!id || !inviteEmail.trim()) return;
    try {
      const invite = await api.post<ClubInvite>(`/api/clubs/${id}/invites`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        expiresInDays: inviteExpiresInDays,
      });
      setInvites(prev => [invite, ...prev]);
      setInviteEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating invite');
    }
  }

  function getInviteUrl(token: string): string {
    return `${inviteBaseUrl}/${token}/accept`;
  }

  async function copyInviteUrl(token: string) {
    await navigator.clipboard.writeText(getInviteUrl(token));
  }

  function sendInviteEmail(invite: ClubInvite) {
    const inviteUrl = getInviteUrl(invite.token);
    const subject = encodeURIComponent(`Invitation to join ${club?.name ?? 'the club'}`);
    const body = encodeURIComponent(
      `Hello,\n\nYou have been invited to join ${club?.name ?? 'our club'} as ${invite.role}.\n\nUse this link to accept your invite:\n${inviteUrl}\n\nIf you already have an account, sign in and accept directly. If not, register using the same email address this invite was sent to.\n\nThanks.`
    );
    window.location.href = `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{club.name}</h1>
          {club.homeOfficeRef && <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>Home Office Ref: {club.homeOfficeRef}</p>}
        </div>
        <div className="actions">
          <Link to={`/clubs/profile/${id}`} className="btn btn-secondary btn-sm">Public Profile</Link>
          {isAdmin && (
            <Link to={`/clubs/${id}/history`} className="btn btn-secondary btn-sm">
              View Sign-In History
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div className="page-header">
          <h2>Club Profile</h2>
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingClubProfile(v => !v)}>
              {editingClubProfile ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        {editingClubProfile ? (
          <form onSubmit={saveClubProfile}>
            <div className="form-group">
              <label>Club Name</label>
              <input value={clubForm.name} onChange={e => setClubForm(prev => ({ ...prev, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Home Office Reference</label>
              <input value={clubForm.homeOfficeRef} onChange={e => setClubForm(prev => ({ ...prev, homeOfficeRef: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={clubForm.address} onChange={e => setClubForm(prev => ({ ...prev, address: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Disciplines Offered</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={disciplineInput}
                  onChange={e => setDisciplineInput(e.target.value)}
                  placeholder="Type a discipline and click Add"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDiscipline();
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={addDiscipline}>Add</button>
              </div>
              <div className="actions" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {clubForm.disciplinesOffered.map(discipline => (
                  <button
                    key={discipline}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => removeDiscipline(discipline)}
                  >
                    {discipline} ×
                  </button>
                ))}
                {clubForm.disciplinesOffered.length === 0 && (
                  <span style={{ color: 'var(--gray-600)' }}>No disciplines added</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Accepting New Members</label>
              <select
                value={clubForm.acceptingNewMembers ? 'yes' : 'no'}
                onChange={e => setClubForm(prev => ({ ...prev, acceptingNewMembers: e.target.value === 'yes' }))}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="form-group">
              <label>Opening Times</label>
              <input value={clubForm.openingTimes} onChange={e => setClubForm(prev => ({ ...prev, openingTimes: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={clubForm.description} onChange={e => setClubForm(prev => ({ ...prev, description: e.target.value }))} rows={4} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingClubProfile}>
              {savingClubProfile ? 'Saving…' : 'Save Club Profile'}
            </button>
          </form>
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.5rem 1rem' }}>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Address</dt>
            <dd>{club.address ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Disciplines Offered</dt>
            <dd>{normalizeDisciplines(club.disciplinesOffered).join(', ') || 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Accepting New Members</dt>
            <dd>{club.acceptingNewMembers ? 'Yes' : 'No'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Opening Times</dt>
            <dd>{club.openingTimes ?? 'N/A'}</dd>
            <dt style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Description</dt>
            <dd>{club.description ?? 'N/A'}</dd>
          </dl>
        )}
      </section>

      {isAdmin && (
        <section>
          <div className="page-header">
            <h2>Invites</h2>
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr auto', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="member@example.com" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'MEMBER' | 'ADMIN')}>
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Expires (days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={inviteExpiresInDays}
                onChange={e => setInviteExpiresInDays(Number(e.target.value) || 14)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button className="btn btn-primary btn-sm" onClick={createInvite} disabled={!inviteEmail.trim()}>
                Create Invite
              </button>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(invite => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td><span className={`badge badge-${invite.role.toLowerCase()}`}>{invite.role}</span></td>
                  <td>
                    {invite.redeemedAt ? (
                      <span className="badge badge-approved">REDEEMED</span>
                    ) : new Date(invite.expiresAt) < new Date() ? (
                      <span className="badge badge-rejected">EXPIRED</span>
                    ) : (
                      <span className="badge badge-pending">PENDING</span>
                    )}
                  </td>
                  <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => copyInviteUrl(invite.token)}>Copy Link</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => sendInviteEmail(invite)}>Send Email</button>
                    </div>
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No invites created yet</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {isAdmin && (
        <section>
          <div className="page-header">
            <h2>Kiosk Links</h2>
            <div className="actions">
              <button className="btn btn-primary btn-sm" onClick={generateKioskLink}>Create Kiosk Link</button>
            </div>
          </div>
          <table style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Link</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.filter(l => l.mode === 'KIOSK').map(l => {
                const path = `/kiosk/${l.cryptoToken}`;
                const fullUrl = `${window.location.origin}${path}`;
                return (
                  <tr key={l.id}>
                    <td><span className="badge badge-member">KIOSK</span></td>
                    <td style={{ maxWidth: 360, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      <a href={path} target="_blank" rel="noreferrer">{fullUrl}</a>
                    </td>
                    <td>{new Date(l.expiresAt).toLocaleString()}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(fullUrl)}>Copy</button>
                        <button className="btn btn-danger btn-sm" onClick={() => revokeLink(l.id)}>Revoke</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {links.filter(l => l.mode === 'KIOSK').length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No active kiosk links</td></tr>
              )}
            </tbody>
          </table>
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
                  {editingRole?.userId === m.userId && m.status === 'APPROVED' ? (
                    <select
                      value={editingRole.role}
                      onChange={e => setEditingRole({ ...editingRole, role: e.target.value as 'MEMBER' | 'ADMIN' })}
                      className="btn btn-sm"
                    >
                      <option value="MEMBER">MEMBER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  ) : (
                    <span className={`badge badge-${m.role.toLowerCase()}`}>{m.role}</span>
                  )}
                </td>
                {isAdmin && (
                  <td>
                    <div className="actions" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
                      <Link className="btn btn-secondary btn-sm" to={`/clubs/${id}/members/${m.userId}`}>View Profile</Link>
                      {m.status === 'PENDING' && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => approveMember(m.userId, 'APPROVED')}>
                            Approve
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => approveMember(m.userId, 'REJECTED')}>
                            Reject
                          </button>
                        </>
                      )}
                      {m.status === 'APPROVED' && (
                        editingRole?.userId === m.userId ? (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => saveRoleChange(m.userId, editingRole.role)} disabled={savingRole}>
                              {savingRole ? 'Saving…' : 'Save'}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingRole(null)} disabled={savingRole}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingRole({ userId: m.userId, role: m.role as 'MEMBER' | 'ADMIN' })}>
                            Edit Role
                          </button>
                        )
                      )}
                    </div>
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
