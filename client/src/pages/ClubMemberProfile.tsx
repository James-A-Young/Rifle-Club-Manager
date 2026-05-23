import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Member, MemberProfileHistoryEntry, ProfileHistoryFieldChange } from '../types/club';
import Section21DeclarationViewModal from '../components/Section21DeclarationViewModal';

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
  const [declaration, setDeclaration] = useState<any>(null);
  const [declarationLoading, setDeclarationLoading] = useState(false);
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);

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

  useEffect(() => {
    if (!id || !userId) return;
    setDeclarationLoading(true);
    api.get<any>(`/api/clubs/${id}/members/${userId}/section21-declaration`)
      .then(decl => setDeclaration(decl))
      .catch(e => console.error('Could not load Section 21 declaration:', e))
      .finally(() => setDeclarationLoading(false));
  }, [id, userId]);

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

          {(declaration?.status === 'NOT_DECLARED' || declaration?.status === 'EXPIRED' || !declaration) && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#fee2e2',
                border: '1px solid #fecaca',
                borderLeft: '4px solid #dc2626',
                borderRadius: '4px',
                color: '#991b1b',
                fontSize: '14px',
                marginBottom: '1.5rem',
              }}
            >
              ⚠️ <strong>Member has not completed the mandatory Section 21 declaration</strong>
              {declaration?.status === 'EXPIRED' && ' - declaration is expired and needs renewal'}
            </div>
          )}

          <section style={{ marginTop: '1.5rem' }}>
            <h2>Section 21 Firearms Act Declaration</h2>
            {declarationLoading ? (
              <div style={{ padding: '0.5rem 0', color: '#6b7280' }}>Loading declaration…</div>
            ) : declaration ? (
              <div style={{ marginBottom: '1rem' }}>
                <table style={{ marginBottom: '1rem' }}>
                  <tbody>
                    <tr>
                      <th>Status</th>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            backgroundColor:
                              declaration.status === 'SIGNED'
                                ? '#d1fae5'
                                : declaration.status === 'EXPIRED'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              declaration.status === 'SIGNED'
                                ? '#047857'
                                : declaration.status === 'EXPIRED'
                                  ? '#991b1b'
                                  : '#92400e',
                            fontSize: '12px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                          }}
                        >
                          {declaration.status}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>Signed By</th>
                      <td>{declaration.fullLegalName}</td>
                    </tr>
                    <tr>
                      <th>Signed Date</th>
                      <td>{new Date(declaration.signedDate).toLocaleDateString('en-GB')}</td>
                    </tr>
                    <tr>
                      <th>Next Renewal Due</th>
                      <td>{new Date(declaration.nextDueDate).toLocaleDateString('en-GB')}</td>
                    </tr>
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => setShowDeclarationModal(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  View Full Declaration
                </button>
              </div>
            ) : (
              <div style={{ padding: '0.5rem 0', color: '#6b7280' }}>No declaration found.</div>
            )}
          </section>

          <Section21DeclarationViewModal
            isOpen={showDeclarationModal}
            onClose={() => setShowDeclarationModal(false)}
            declaration={declaration}
            isAdminView={true}
          />

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
