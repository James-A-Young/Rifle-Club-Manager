import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';

interface IssuedLink {
  id: string;
  cryptoToken: string;
  expiresAt: string;
}

interface Firearm { id: string; make: string; model: string; caliber: string; }

interface KioskLinkData {
  id: string;
  clubId: string;
  mode: 'KIOSK' | 'QR';
  isAuthenticated?: boolean;
  accessToken: string;
  accessTokenExpiresInMinutes: number;
  club: {
    id: string;
    name: string;
    firearms: Firearm[];
  };
}

interface ActiveVisitor {
  publicVisitRef: string;
  visitorName: string;
  visitorEmail: string;
  purpose: string;
  timeIn: string;
  firearm: string | null;
}

interface ClubMembership {
  id: string;
  userId: string;
  clubId: string;
  role: string;
}

const ISSUE_INTERVAL_MS = 45_000;
const REFRESH_VISITS_INTERVAL_MS = 5_000;
const PURPOSES = ['Practice', 'Competition', 'Training', 'Other'];

const EMPTY_DETAILS = {
  guestName: '',
  guestClubRepresented: '',
  guestEmail: '',
};

export default function KioskSignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const [kioskData, setKioskData] = useState<KioskLinkData | null>(null);
  const [issuedLink, setIssuedLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [manualForm, setManualForm] = useState({
    purpose: 'Practice',
    firearmUsedId: '',
    firearmSerialNumber: '',
    guestDetails: EMPTY_DETAILS,
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [activeVisits, setActiveVisits] = useState<ActiveVisitor[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [signoutLoading, setSignoutLoading] = useState<string | null>(null);
  const [signoutAllLoading, setSignoutAllLoading] = useState(false);
  const isAuthenticatedKioskUser = Boolean(kioskData?.isAuthenticated);

  // Load kiosk data on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const loadKiosk = async () => {
      try {
        const data = await api.get<KioskLinkData>(`/api/sign-in-links/${token}`);
        if (data.mode !== 'KIOSK') {
          setError('This link is not a kiosk sign-in link.');
          setLoading(false);
          return;
        }
        setKioskData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid kiosk link');
      } finally {
        setLoading(false);
      }
    };

    loadKiosk();
  }, [token]);

  // Issue rotating QR codes
  useEffect(() => {
    if (!token || !kioskData) return;

    let cancelled = false;

    const issue = async () => {
      try {
        const next = await api.post<IssuedLink>(`/api/sign-in-links/${token}/issue`, { expiresInMinutes: 5 });
        if (!cancelled) {
          setIssuedLink(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to issue sign-in QR');
        }
      }
    };

    issue();
    const interval = window.setInterval(issue, ISSUE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, kioskData]);

  // Load active visits and check admin status
  useEffect(() => {
    if (!token || !kioskData) return;

    const loadVisits = async () => {
      setVisitsLoading(true);
      setVisitsError('');
      try {
        const visits = await api.get<ActiveVisitor[]>(`/api/visits/kiosk/${token}/active`);
        setActiveVisits(visits);
      } catch (e) {
        setVisitsError(e instanceof Error ? e.message : 'Error loading active visits');
      } finally {
        setVisitsLoading(false);
      }
    };

    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      try {
        const memberships = await api.get<ClubMembership[]>(`/api/clubs/${kioskData.clubId}/members`);
        const myMembership = memberships.find(m => m.userId === user.id);
        setIsAdmin(myMembership?.role === 'ADMIN' || false);
      } catch {
        setIsAdmin(false);
      }
    };

    loadVisits();
    checkAdmin();
    const interval = window.setInterval(loadVisits, REFRESH_VISITS_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, kioskData, user?.id]);

  const qrUrl = useMemo(() => {
    if (!issuedLink) return '';
    return `${window.location.origin}/sign-in/${issuedLink.cryptoToken}`;
  }, [issuedLink]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kioskData) return;

    setManualSubmitting(true);
    setError('');
    try {
      const payload: {
        signInAccessToken: string;
        purpose: string;
        firearmUsedId?: string;
        firearmSerialNumber?: string;
        guestDetails?: typeof EMPTY_DETAILS;
      } = {
        signInAccessToken: kioskData.accessToken,
        purpose: manualForm.purpose,
        firearmUsedId: manualForm.firearmUsedId || undefined,
        firearmSerialNumber: manualForm.firearmSerialNumber || undefined,
      };

      if (!isAuthenticatedKioskUser) {
        payload.guestDetails = manualForm.guestDetails;
      }

      await api.post('/api/visits/public', {
        ...payload,
      });
      setManualSuccess(true);
      setManualForm({
        purpose: 'Practice',
        firearmUsedId: '',
        firearmSerialNumber: '',
        guestDetails: EMPTY_DETAILS,
      });
      // Refresh visits list
      setTimeout(async () => {
        try {
          const visits = await api.get<ActiveVisitor[]>(`/api/visits/kiosk/${token}/active`);
          setActiveVisits(visits);
          setManualSuccess(false);
        } catch (e) {
          setVisitsError(e instanceof Error ? e.message : 'Error refreshing visits');
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing in');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleSignOut = async (publicVisitRef: string) => {
    if (!token) return;
    setSignoutLoading(publicVisitRef);
    try {
      await api.post(`/api/visits/kiosk/${token}/signout`, { publicVisitRef });
      // Refresh visits list
      const visits = await api.get<ActiveVisitor[]>(`/api/visits/kiosk/${token}/active`);
      setActiveVisits(visits);
    } catch (err) {
      setVisitsError(err instanceof Error ? err.message : 'Error signing out');
    } finally {
      setSignoutLoading(null);
    }
  };

  const handleSignOutAll = async () => {
    if (!kioskData || !confirm('Are you sure you want to sign out all visitors? This cannot be undone.')) {
      return;
    }

    setSignoutAllLoading(true);
    try {
      await api.patch(`/api/visits/club/${kioskData.clubId}/signout-all`, { confirm: true });
      // Refresh visits list
      const visits = await api.get<ActiveVisitor[]>(`/api/visits/kiosk/${token}/active`);
      setActiveVisits(visits);
    } catch (err) {
      setVisitsError(err instanceof Error ? err.message : 'Error signing out all visitors');
    } finally {
      setSignoutAllLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  if (error && !kioskData) {
    return (
      <div className="auth-page" style={{ maxWidth: 620 }}>
        <div className="card">
          <h1>Kiosk Sign-In</h1>
          <div className="alert alert-error">{error}</div>
        </div>
      </div>
    );
  }

  const clubFirearms = kioskData?.club.firearms ?? [];

  return (
    <div className="kiosk-page">
      <div className="page-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>{kioskData?.club.name} - Kiosk</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', gap: '2rem', flexWrap: 'wrap' }}>
      {/* QR Code Section */}
      <div className="card kiosk-card" style={{ flex: '4' }}>
        <h2>QR Sign-In</h2>
        <p style={{ color: 'var(--gray-600)', marginBottom: '1rem' }}>Scan the QR code to open the sign-in form.</p>
        <div className="qr-container">
          {qrUrl ? <QRCodeSVG value={qrUrl} size={300} /> : <p>Preparing QR…</p>}
        </div>
        <p className="link-text" style={{ marginTop: '1rem' }}>QR rotates automatically every 45 seconds.</p>
      </div>

        {/* Manual Sign-In Section */}
        <div className="card" style={{ flex: '6' }}>
        <h2>Manual Sign-In</h2>
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {manualSuccess && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            ✅ Visitor signed in successfully
          </div>
        )}
      
        {kioskData && (
          <form onSubmit={handleManualSubmit}>
            {!isAuthenticatedKioskUser && (
              <>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={manualForm.guestDetails.guestName}
                    onChange={e =>
                      setManualForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestName: e.target.value },
                      }))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Club/Organization You Represent *</label>
                  <input
                    type="text"
                    value={manualForm.guestDetails.guestClubRepresented}
                    onChange={e =>
                      setManualForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestClubRepresented: e.target.value },
                      }))
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address (optional)</label>
                  <input
                    type="email"
                    value={manualForm.guestDetails.guestEmail}
                    onChange={e =>
                      setManualForm(f => ({
                        ...f,
                        guestDetails: { ...f.guestDetails, guestEmail: e.target.value },
                      }))
                    }
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Purpose of Visit *</label>
              <select
                value={manualForm.purpose}
                onChange={e => setManualForm(f => ({ ...f, purpose: e.target.value }))}
              >
                {PURPOSES.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Firearm Used (optional)</label>
              <select
                value={manualForm.firearmUsedId}
                onChange={e => setManualForm(f => ({ ...f, firearmUsedId: e.target.value }))}
              >
                <option value="">None / Not applicable</option>
                {clubFirearms.length > 0 && (
                  <optgroup label="Club Firearms">
                    {clubFirearms.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.make} {f.model} ({f.caliber})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Rifle Serial Number (optional)</label>
              <input
                type="text"
                value={manualForm.firearmSerialNumber}
                onChange={e =>
                  setManualForm(f => ({
                    ...f,
                    firearmSerialNumber: e.target.value,
                  }))
                }
                placeholder="Enter serial number if using personal rifle"
              />
            </div>

            {!isAuthenticatedKioskUser && (
              <div className="form-group">
                <label>Reason for Visit (optional)</label>
                <input
                  type="text"
                  placeholder="E.g., Guest of [member name]"
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={manualSubmitting}
            >
              {manualSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
        </div>
      {/* Signed In List Section */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Currently Signed In ({activeVisits.length})</h2>
          {isAdmin && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleSignOutAll}
              disabled={signoutAllLoading || activeVisits.length === 0}
            >
              {signoutAllLoading ? 'Signing out…' : 'Sign Out All'}
            </button>
          )}
        </div>

        {visitsError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{visitsError}</div>}

        {visitsLoading ? (
          <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>Loading…</p>
        ) : activeVisits.length === 0 ? (
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
              {activeVisits.map(v => (
                <tr key={v.publicVisitRef}>
                  <td>{v.visitorName}</td>
                  <td>{v.visitorEmail}</td>
                  <td>{v.purpose}</td>
                  <td>{v.firearm || '—'}</td>
                  <td>{new Date(v.timeIn).toLocaleTimeString()}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleSignOut(v.publicVisitRef)}
                      disabled={signoutLoading === v.publicVisitRef}
                    >
                      {signoutLoading === v.publicVisitRef ? 'Signing out…' : 'Sign Out'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
