import { useState } from 'react';
import { ClubInvite, MembershipRoleType } from '../../types/club';

interface Props {
  invites: ClubInvite[];
  email: string;
  role: MembershipRoleType;
  expiresInDays: number;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: MembershipRoleType) => void;
  onExpiresChange: (days: number) => void;
  onCreate: () => void;
  onCreateBulk: (emails: string[]) => Promise<void>;
  onCopyUrl: (token: string) => void;
  onSendEmail: (invite: ClubInvite) => void;
  onCancel: (invite: ClubInvite) => void;
}

export default function InvitesSection({
  invites,
  email,
  role,
  expiresInDays,
  onEmailChange,
  onRoleChange,
  onExpiresChange,
  onCreate,
  onCreateBulk,
  onCopyUrl,
  onSendEmail,
  onCancel,
}: Props) {
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkModeEnabled, setBulkModeEnabled] = useState(false);
  const [showRedeemed, setShowRedeemed] = useState(false);
  const visibleInvites = showRedeemed ? invites : invites.filter(invite => !invite.redeemedAt);

  async function handleCreateBulk() {
    const emails = Array.from(new Set(
      bulkEmails
        .split(/\r?\n/)
        .map(emailLine => emailLine.trim().toLowerCase())
        .filter(Boolean),
    ));
    if (emails.length === 0 || bulkSubmitting) return;

    setBulkSubmitting(true);
    try {
      await onCreateBulk(emails);
      setBulkEmails('');
    } finally {
      setBulkSubmitting(false);
    }
  }

  function toggleBulkMode() {
    setBulkModeEnabled(prev => {
      const next = !prev;
      if (!next) {
        setBulkEmails('');
      }
      return next;
    });
  }

  return (
    <section>
      <div className="page-header">
        <h2>Invites</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
            <input
              type="checkbox"
              checked={showRedeemed}
              onChange={e => setShowRedeemed(e.target.checked)}
            />
            Show Redeemed
          </label>
          <button className="btn btn-secondary btn-sm" onClick={toggleBulkMode}>
            {bulkModeEnabled ? 'Disable Bulk Mode' : 'Enable Bulk Mode'}
          </button>
        </div>
      </div>
      <div
        className="stats-grid"
        style={{ gridTemplateColumns: bulkModeEnabled ? '1fr 1fr' : '2fr 1fr 1fr auto', marginBottom: '1rem' }}
      >
        {!bulkModeEnabled && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Email</label>
            <input
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              placeholder="member@example.com"
            />
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Role</label>
          <select value={role} onChange={e => onRoleChange(e.target.value as MembershipRoleType)}>
            <option value="MEMBER">MEMBER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="PROBATIONARY_MEMBER">PROBATIONARY MEMBER</option>
            <option value="JUNIOR">JUNIOR</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Expires (days)</label>
          <input
            type="number"
            min={1}
            max={90}
            value={expiresInDays}
            onChange={e => onExpiresChange(Number(e.target.value) || 14)}
          />
        </div>
        {!bulkModeEnabled && (
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={onCreate}
              disabled={!email.trim()}
            >
              Create Invite
            </button>
          </div>
        )}
      </div>

      {bulkModeEnabled && (
        <div
          className="stats-grid"
          style={{ gridTemplateColumns: '2fr auto', marginBottom: '1rem' }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Bulk Invite Members (one email per line)</label>
            <textarea
              rows={5}
              value={bulkEmails}
              onChange={e => setBulkEmails(e.target.value)}
              placeholder={[
                'alice@example.com',
                'bob@example.com',
                'charlie@example.com',
              ].join('\n')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleCreateBulk()}
              disabled={!bulkEmails.trim() || bulkSubmitting}
            >
              {bulkSubmitting ? 'Creating…' : 'Create Bulk Invites'}
            </button>
          </div>
        </div>
      )}

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
          {visibleInvites.map(invite => (
            <tr key={invite.id}>
              <td>{invite.email}</td>
              <td>
                <span className={`badge badge-${invite.role.toLowerCase()}`}>{invite.role}</span>
              </td>
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
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onCopyUrl(invite.token)}
                  >
                    Copy Link
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onSendEmail(invite)}
                    disabled={Boolean(invite.redeemedAt) || new Date(invite.expiresAt) < new Date()}
                  >
                    Resend Email
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => onCancel(invite)}
                    disabled={Boolean(invite.redeemedAt)}
                  >
                    Cancel
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {visibleInvites.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                No invites outstanding
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
