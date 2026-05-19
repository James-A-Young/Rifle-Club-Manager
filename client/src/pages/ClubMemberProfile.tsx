import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Member, MemberProfileHistoryEntry, ProfileHistoryFieldChange } from '../types/club';

const profileFieldLabel: Record<ProfileHistoryFieldChange['field'], string> = {
  name: 'Name',
  address: 'Address',
  placeOfBirth: 'Place of Birth',
  dateOfBirth: 'Date of Birth',
  firearmCertificateNumber: 'Firearm Certificate #',
  firearmCertificateExpiry: 'Firearm Certificate Expiry',
  shotgunCertificateNumber: 'Shotgun Certificate #',
  shotgunCertificateExpiry: 'Shotgun Certificate Expiry',
};

function formatHistoryValue(value: string | null): string {
  if (!value) return 'N/A';
  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime()) && value.includes('T')) {
    return parsedDate.toISOString();
  }
  return value;
}

export default function ClubMemberProfile() {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [history, setHistory] = useState<MemberProfileHistoryEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    api.get<Member[]>(`/api/clubs/${id}/members`)
      .then(setMembers)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load member profile'))
      .finally(() => setLoading(false));
  }, [id]);

  const member = useMemo(() => members.find(m => m.userId === userId), [members, userId]);

  useEffect(() => {
    if (!id || !member || !historyExpanded || historyLoaded) return;

    setHistoryLoading(true);
    setHistoryError('');

    api.get<MemberProfileHistoryEntry[]>(`/api/clubs/${id}/members/${member.userId}/profile-history`)
      .then(items => {
        setHistory(items);
        setHistoryLoaded(true);
      })
      .catch(e => setHistoryError(e instanceof Error ? e.message : 'Could not load profile history'))
      .finally(() => setHistoryLoading(false));
  }, [id, member, historyExpanded, historyLoaded]);

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
        <>
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

          <section style={{ marginTop: '1.5rem' }}>
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
              <h2>Profile History</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHistoryExpanded(prev => !prev)}
              >
                {historyExpanded ? 'Hide History' : 'Show History'}
              </button>
            </div>

            {historyExpanded && (
              <>
                {historyLoading && <div style={{ padding: '0.5rem 0' }}>Loading history…</div>}
                {historyError && <div className="alert alert-error">{historyError}</div>}
                {!historyLoading && !historyError && history.length === 0 && (
                  <div className="alert alert-info">No profile changes since first approval in this club.</div>
                )}

                {!historyLoading && !historyError && history.length > 0 && history.map(entry => (
                  <article
                    key={entry.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                      Changed: {new Date(entry.changedAt).toISOString()}
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Previous</th>
                          <th>New</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.changes.map(change => (
                          <tr key={`${entry.id}-${change.field}`}>
                            <td>{profileFieldLabel[change.field]}</td>
                            <td>{formatHistoryValue(change.oldValue)}</td>
                            <td>{formatHistoryValue(change.newValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </article>
                ))}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
