import { Link } from 'react-router-dom';
import { Member, MembershipRoleType, EditingRoleState } from '../../types/club';

interface Props {
  members: Member[];
  clubId: string;
  isAdmin: boolean;
  currentUserId?: string;
  onExportMembersCsv?: () => void;
  editingRole: EditingRoleState | null;
  savingRole: boolean;
  removingUserId: string | null;
  onApprove: (userId: string, status: 'APPROVED' | 'REJECTED') => void;
  onRemove: (userId: string) => void;
  onStartEditRole: (userId: string, role: MembershipRoleType) => void;
  onEditingRoleChange: (role: MembershipRoleType) => void;
  onSaveRole: () => void;
  onCancelEditRole: () => void;
}

export default function MembersSection({
  members,
  clubId,
  isAdmin,
  currentUserId,
  onExportMembersCsv,
  editingRole,
  savingRole,
  removingUserId,
  onApprove,
  onRemove,
  onStartEditRole,
  onEditingRoleChange,
  onSaveRole,
  onCancelEditRole,
}: Props) {
  function getSection21Color(status?: Member['section21Status']): { background: string; color: string } {
    switch (status) {
      case 'SIGNED':
        return { background: '#d1fae5', color: '#047857' };
      case 'EXPIRED':
        return { background: '#fee2e2', color: '#991b1b' };
      case 'PENDING_RENEWAL':
        return { background: '#fef3c7', color: '#92400e' };
      default:
        return { background: '#e5e7eb', color: '#374151' };
    }
  }

  return (
    <section>
      <div className="page-header">
        <h2>Members</h2>
        {isAdmin && onExportMembersCsv && (
          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={onExportMembersCsv}>
              Export Membership CSV
            </button>
          </div>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Section 21</th>
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
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    backgroundColor: getSection21Color(m.section21Status).background,
                    color: getSection21Color(m.section21Status).color,
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {m.section21Status ?? 'NOT_DECLARED'}
                </span>
              </td>
              <td>
                {editingRole?.userId === m.userId && m.status === 'APPROVED' ? (
                  <select
                    value={editingRole.role}
                    onChange={e => onEditingRoleChange(e.target.value as MembershipRoleType)}
                    className="btn btn-sm"
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="PROBATIONARY_MEMBER">PROBATIONARY MEMBER</option>
                    <option value="JUNIOR">JUNIOR</option>
                  </select>
                ) : (
                  <span className={`badge badge-${m.role.toLowerCase()}`}>{m.role}</span>
                )}
              </td>
              {isAdmin && (
                <td>
                  <div className="actions" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
                    <Link className="btn btn-secondary btn-sm" to={`/clubs/${clubId}/members/${m.userId}`}>
                      View Profile
                    </Link>
                    {m.status === 'PENDING' && (
                      <>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => onApprove(m.userId, 'APPROVED')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => onApprove(m.userId, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {m.status === 'APPROVED' && (
                      editingRole?.userId === m.userId ? (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={onSaveRole}
                            disabled={savingRole}
                          >
                            {savingRole ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={onCancelEditRole}
                            disabled={savingRole}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onStartEditRole(m.userId, m.role as MembershipRoleType)}
                        >
                          Edit Role
                        </button>
                      )
                    )}
                    {m.status === 'APPROVED' && m.userId !== currentUserId && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => onRemove(m.userId)}
                        disabled={removingUserId === m.userId}
                      >
                        {removingUserId === m.userId ? 'Removing…' : 'Remove Member'}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
