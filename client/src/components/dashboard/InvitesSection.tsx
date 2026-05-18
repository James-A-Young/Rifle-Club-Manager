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
  onCopyUrl,
  onSendEmail,
  onCancel,
}: Props) {

  return (
    <section>
      <div className="page-header">
        <h2>Invites</h2>
      </div>
      <div
        className="stats-grid"
        style={{ gridTemplateColumns: '2fr 1fr 1fr auto', marginBottom: '1rem' }}
      >
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Email</label>
          <input
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="member@example.com"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Role</label>
          <select value={role} onChange={e => onRoleChange(e.target.value as MembershipRoleType)}>
            <option value="MEMBER">MEMBER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="PROBATIONARY_MEMBER">PROBATIONARY MEMBER</option>
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
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={onCreate}
            disabled={!email.trim()}
          >
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
          {invites.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                No invites created yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
