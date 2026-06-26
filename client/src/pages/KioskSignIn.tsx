import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import VisitSignInForm, { VisitFormPayload } from '../components/VisitSignInForm';
import ActiveVisitorsTable, { ActiveVisitorRow } from '../components/ActiveVisitorsTable';
import MembershipCardScannerModal, { MemberCardPreviewResponse } from '../components/MembershipCardScannerModal';
import { SimpleFirearm } from '../types/club';

interface IssuedLink {
  id: string;
  cryptoToken: string;
  expiresAt: string;
}

interface KioskLinkData {
  id: string;
  clubId: string;
  mode: 'KIOSK' | 'QR';
  isAuthenticated?: boolean;
  accessToken: string;
  accessTokenExpiresInMinutes: number;
  userFirearms: SimpleFirearm[];
  club: {
    id: string;
    name: string;
    firearms: SimpleFirearm[];
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
const REFRESH_VISITS_INTERVAL_MS = 120_000;

export default function KioskSignIn() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const [kioskData, setKioskData] = useState<KioskLinkData | null>(null);
  const [issuedLink, setIssuedLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [activeVisits, setActiveVisits] = useState<ActiveVisitor[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [signoutLoading, setSignoutLoading] = useState<string | null>(null);
  const [signoutAllLoading, setSignoutAllLoading] = useState(false);
  const [cardScanOpen, setCardScanOpen] = useState(false);
  const [cardSignInError, setCardSignInError] = useState('');
  const [cardPreview, setCardPreview] = useState<MemberCardPreviewResponse | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const isAuthenticatedKioskUser = Boolean(kioskData?.isAuthenticated);

  function resetCardFlowState() {
    setCardPreview(null);
    setCardModalOpen(false);
    setCardSignInError('');
  }

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

  async function handleManualSubmit(payload: VisitFormPayload) {
    if (!kioskData) return;
    setError('');
    try {
      await api.post('/api/visits/public', {
        signInAccessToken: kioskData.accessToken,
        ...payload,
      });
      setManualSuccess(true);
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
      // Re-throw so VisitSignInForm keeps the form populated (doesn't reset on error)
      throw err;
    }
  }

  async function handleMemberCardSubmit(payload: VisitFormPayload) {
    if (!kioskData || !cardPreview) {
      return;
    }

    setCardSignInError('');

    try {
      await api.post('/api/visits/kiosk/qr-signin-confirm', {
        signInAccessToken: kioskData.accessToken,
        memberCardSignInToken: cardPreview.memberCardSignInToken,
        ...payload,
      });

      setManualSuccess(true);
      setCardModalOpen(false);
      resetCardFlowState();

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
      const message = err instanceof Error ? err.message : 'Error signing in with membership card';
      if (/already signed in/i.test(message)) {
        setCardModalOpen(false);
        resetCardFlowState();
        try {
          const visits = await api.get<ActiveVisitor[]>(`/api/visits/kiosk/${token}/active`);
          setActiveVisits(visits);
        } catch {
          // Ignore refresh errors for silent duplicate handling
        }
        return;
      }

      setCardSignInError(message);
      throw err;
    }
  }

  const handleSignOut = async (publicVisitRef: string) => {
    if (!token) return;
    setSignoutLoading(publicVisitRef);
    try {
      await api.post(`/api/visits/kiosk/${token}/signout`, { publicVisitRef });
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
  const myFirearms = kioskData?.userFirearms ?? [];

  const visitRows: ActiveVisitorRow[] = activeVisits.map(v => ({
    signOutId: v.publicVisitRef,
    visitorName: v.visitorName,
    visitorEmail: v.visitorEmail,
    purpose: v.purpose,
    firearm: v.firearm,
    timeIn: v.timeIn,
  }));

  return (
    <div className="kiosk-page">
      <div className="page-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>{kioskData?.club.name} - Kiosk</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', gap: '2rem', flexWrap: 'wrap' }}>
        {/* QR Code Section */}
        <div className="card kiosk-card" style={{ flex: '4' }}>
          <h2>QR Sign-In</h2>
          <p style={{ color: 'var(--gray-600)', marginBottom: '1rem' }}>
            Scan the QR code to open the sign-in form.
          </p>
          <div className="qr-container">
            {qrUrl ? <QRCodeSVG value={qrUrl} size={300} /> : <p>Preparing QR…</p>}
          </div>
          <p className="link-text" style={{ marginTop: '1rem' }}>QR rotates automatically every 45 seconds.</p>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '1rem', height: '8rem' }}
            onClick={() => setCardScanOpen(true)}
          >
            Press to scan Membership Card
          </button>
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
            <VisitSignInForm
              clubFirearms={clubFirearms}
              myFirearms={myFirearms}
              isAuthenticated={isAuthenticatedKioskUser}
              onSubmit={handleManualSubmit}
            />
          )}
        </div>
      </div>

      {/* Signed In List Section */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <ActiveVisitorsTable
          visits={visitRows}
          loading={visitsLoading}
          error={visitsError}
          signOutLoadingId={signoutLoading}
          showSignOutAll={isAdmin}
          signOutAllLoading={signoutAllLoading}
          onSignOut={handleSignOut}
          onSignOutAll={handleSignOutAll}
        />
      </div>

      <MembershipCardScannerModal
        open={cardScanOpen}
        signInAccessToken={kioskData?.accessToken}
        onClose={() => setCardScanOpen(false)}
        onPreview={(preview) => {
          setCardPreview(preview);
          setCardModalOpen(true);
          setCardScanOpen(false);
        }}
        onDuplicateSignIn={() => {
          setCardScanOpen(false);
          resetCardFlowState();
        }}
      />

      {cardModalOpen && cardPreview && (
        <div className="policy-modal-backdrop" onClick={() => { setCardModalOpen(false); resetCardFlowState(); }}>
          <div
            className="policy-modal"
            style={{ width: 'min(680px, 100%)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Membership Card Sign-In"
            onClick={e => e.stopPropagation()}
          >
            <div className="policy-modal-header">
              <h2>Member Sign-In</h2>
              <button className="btn btn-secondary" type="button" onClick={() => { setCardModalOpen(false); resetCardFlowState(); }}>
                Close
              </button>
            </div>
            <div className="policy-modal-content">
              <p style={{ marginTop: 0 }}>
                Signing in as {cardPreview.member.name}.
              </p>
              {cardSignInError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{cardSignInError}</div>}
              <VisitSignInForm
                clubFirearms={clubFirearms}
                myFirearms={cardPreview.userFirearms}
                isAuthenticated
                submitLabel="Complete Sign-In"
                onSubmit={handleMemberCardSubmit}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
