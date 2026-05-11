/** Shared active-visitors table used by ClubDashboard and KioskSignIn. */

export interface ActiveVisitorRow {
  /** The ID to pass to onSignOut — v.id (dashboard) or v.publicVisitRef (kiosk). */
  signOutId: string;
  visitorName: string;
  visitorEmail: string;
  purpose: string;
  firearm: string | null;
  timeIn: string;
}

interface Props {
  visits: ActiveVisitorRow[];
  loading: boolean;
  error: string;
  /** The signOutId of the row currently being signed out, or null. */
  signOutLoadingId: string | null;
  /** When true, renders the "Sign Out All" button. */
  showSignOutAll: boolean;
  signOutAllLoading: boolean;
  onSignOut: (signOutId: string) => void;
  onSignOutAll: () => void;
}

export default function ActiveVisitorsTable({
  visits,
  loading,
  error,
  signOutLoadingId,
  showSignOutAll,
  signOutAllLoading,
  onSignOut,
  onSignOutAll,
}: Props) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Currently Signed In ({visits.length})</h2>
        {showSignOutAll && (
          <button
            className="btn btn-danger btn-sm"
            onClick={onSignOutAll}
            disabled={signOutAllLoading || visits.length === 0}
          >
            {signOutAllLoading ? 'Signing out…' : 'Sign Out All'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>Loading…</p>
      ) : visits.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No active visitors</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Purpose</th>
              <th>Firearm</th>
              <th>Time In</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visits.map(v => (
              <tr key={v.signOutId}>
                <td>{v.visitorName}</td>
                <td>{v.visitorEmail}</td>
                <td>{v.purpose}</td>
                <td>{v.firearm || '—'}</td>
                <td>{new Date(v.timeIn).toLocaleTimeString()}</td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => onSignOut(v.signOutId)}
                    disabled={signOutLoadingId === v.signOutId}
                  >
                    {signOutLoadingId === v.signOutId ? 'Signing out…' : 'Sign Out'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
