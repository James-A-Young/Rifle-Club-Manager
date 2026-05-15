import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { DueCard, ScoringAverages } from '../types/club';
import addToGWallet from '../assets/add_to_google_wallet.svg';

interface Club { id: string; name: string; }
interface VisitLog { id: string; clubId: string; purpose: string; timeIn: string; timeOut: string | null; club: Club; }
interface MembershipPassResponse { addToWalletLink?: string; }
interface AmmunitionPurchase {
  id: string;
  buyerFirstName: string;
  buyerLastName: string;
  quantity: number;
  totalPricePence: number;
  createdAt: string;
  club: Club;
  ammunitionType: { id: string; name: string };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState<VisitLog[]>([]);
  const [activeVisit, setActiveVisit] = useState<VisitLog | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [membershipPasses, setMembershipPasses] = useState<Map<string,string>>(new Map()); // clubId -> passLink
  const [ammunitionPurchases, setAmmunitionPurchases] = useState<AmmunitionPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [joinClubId, setJoinClubId] = useState('');
  const [joinMsg, setJoinMsg] = useState('');

  // Scoring — keyed by clubId so stale cards are replaced on each load
  const [dueCardsByClub, setDueCardsByClub] = useState<Record<string, DueCard[]>>({});
  const [avgsByClub, setAvgsByClub] = useState<Record<string, ScoringAverages & { clubName: string }>>({});

  useEffect(() => {
    Promise.all([
      api.get<Club[]>('/api/clubs'),
      api.get<VisitLog[]>('/api/visits/mine'),
      api.get<VisitLog | null>('/api/visits/active'),
      api.get<AmmunitionPurchase[]>('/api/ammunition/mine'),
    ])
      .then(([c, v, av, purchases]) => {
        setClubs(c);
        setVisits(v);
        setActiveVisit(av);
        setAmmunitionPurchases(purchases);

        // Load scoring data per club in background (non-blocking)
        c.forEach(club => {
          api.get<DueCard[]>(`/api/clubs/${club.id}/scoring/mine/due`)
            .then(cards => setDueCardsByClub(prev => ({ ...prev, [club.id]: cards })))
            .catch(() => { /* silently ignore if club has no scoring */ });

          api.get<ScoringAverages>(`/api/clubs/${club.id}/scoring/mine/averages`)
            .then(avgs => setAvgsByClub(prev => ({
              ...prev,
              [club.id]: { ...avgs, clubName: club.name },
            })))
            .catch(() => { /* silently ignore */ });

          api.get<MembershipPassResponse>(`/api/users/me/membership-passes/${club.id}`)
            .then(pass => {
              if (pass?.addToWalletLink) {
                setMembershipPasses(prev => new Map(prev).set(club.id, pass.addToWalletLink as string));
              }
            })
            .catch(() => { /* silently ignore if club has no membership pass */ });
        });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading data'))
      .finally(() => setLoading(false));
  }, []);

  async function signOut() {
    if (!activeVisit) return;
    try {
      await api.patch(`/api/visits/${activeVisit.id}/signout`, {});
      setActiveVisit(null);
      const updated = await api.get<VisitLog[]>('/api/visits/mine');
      setVisits(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error signing out');
    }
  }

  async function joinClub() {
    try {
      await api.post(`/api/clubs/${joinClubId}/join`, {});
      setJoinMsg('Join request submitted!');
      setShowJoin(false);
    } catch (e) {
      setJoinMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  const totalVisits = visits.length;
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const recentVisits = visits.filter(v => new Date(v.timeIn) > monthAgo).length;

  // Aggregate averages across all clubs that have scores; exclude null averages
  const clubsWithScores = Object.values(avgsByClub).filter(a => a.totalCardsShot > 0);
  const clubsWithAllTime = clubsWithScores.filter(a => a.allTimeAverage !== null);
  const overallAllTimeAvg = clubsWithAllTime.length > 0
    ? clubsWithAllTime.reduce((acc, a) => acc + (a.allTimeAverage as number), 0) / clubsWithAllTime.length
    : null;
  const clubsWithLast10 = clubsWithScores.filter(a => a.last10Average !== null);
  const overallLast10Avg = clubsWithLast10.length > 0
    ? clubsWithLast10.reduce((acc, a) => acc + (a.last10Average as number), 0) / clubsWithLast10.length
    : null;

  // Flatten all due cards from all clubs and sort by dueDate ascending
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sortedDueCards = Object.values(dueCardsByClub)
    .flat()
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  if (loading) return <div>Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span>Welcome, {user?.name}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="value">{totalVisits}</div>
          <div className="label">Total Visits</div>
        </div>
        <div className="stat-card">
          <div className="value">{recentVisits}</div>
          <div className="label">Visits This Month</div>
        </div>
        {overallAllTimeAvg !== null && (
          <div className="stat-card">
            <div className="value">{overallAllTimeAvg.toFixed(1)}</div>
            <div className="label">All-Time Score Avg</div>
          </div>
        )}
        {overallLast10Avg !== null && (
          <div className="stat-card">
            <div className="value">{overallLast10Avg.toFixed(1)}</div>
            <div className="label">Last 10 Cards Avg</div>
          </div>
        )}
      </div>

      {activeVisit && (
        <div className="active-visit-banner">
          <div>
            <strong>Currently signed in</strong> at {activeVisit.club?.name ?? 'club'} —{' '}
            {activeVisit.purpose}
          </div>
          <button className="btn btn-danger btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      )}

      {sortedDueCards.length > 0 && (
        <section>
          <h2>Upcoming Score Cards</h2>
          <table>
            <thead>
              <tr>
                <th>Competition</th>
                <th>Round</th>
                <th>Card</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedDueCards.map(card => {
                const due = new Date(card.dueDate);
                const isOverdue = due < now && due >= sevenDaysAgo;
                return (
                  <tr
                    key={card.scoreId}
                    style={isOverdue ? { background: '#fdecea', color: '#c0392b' } : undefined}
                  >
                    <td>{card.competitionName}</td>
                    <td>Round {card.roundNumber}</td>
                    <td>Card {card.cardNumber}</td>
                    <td style={{ fontWeight: isOverdue ? 600 : undefined }}>
                      {due.toLocaleDateString()}
                      {isOverdue && <span style={{ marginLeft: '0.4rem', fontSize: '0.8rem' }}>Overdue</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <div className="page-header">
          <h2>My Clubs</h2>
          <div className="actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowJoin(s => !s)}>
              Join Club
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/clubs/new')}>
              Create Club
            </button>
          </div>
        </div>
        {joinMsg && <div className="alert alert-info">{joinMsg}</div>}
        {showJoin && (
          <div style={{ marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Select club to join</label>
              <select value={joinClubId} onChange={e => setJoinClubId(e.target.value)}>
                <option value="">-- choose --</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={joinClub} disabled={!joinClubId}>
              Request to Join
            </button>
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th></th>
              <th>Membership Pass</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map(club => {
              const saveUrl = membershipPasses.get(club.id) || '#';
              return (
                <tr key={club.id}>
                  <td>{club.name}</td>
                  <td>
                    <Link to={`/clubs/${club.id}`} className="btn btn-secondary btn-sm">View</Link>
                    </td>
                  <td>
                    { saveUrl !== '#' ? (
                    <a href={saveUrl}><img src={addToGWallet} alt="Add to Google Wallet" /></a>) : null }
                  </td>
                </tr>
              );
            })}
            {clubs.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No clubs yet</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Recent Visits</h2>
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th>Purpose</th>
              <th>Time In</th>
              <th>Time Out</th>
            </tr>
          </thead>
          <tbody>
            {visits.slice(0, 10).map(v => (
              <tr key={v.id}>
                <td>{v.club?.name ?? v.clubId}</td>
                <td>{v.purpose}</td>
                <td>{new Date(v.timeIn).toLocaleString()}</td>
                <td>{v.timeOut ? new Date(v.timeOut).toLocaleString() : <span className="badge badge-pending">Active</span>}</td>
              </tr>
            ))}
            {visits.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No visits yet</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Ammunition Purchased</h2>
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Total</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {ammunitionPurchases.slice(0, 10).map(row => (
              <tr key={row.id}>
                <td>{row.club.name}</td>
                <td>{row.ammunitionType.name}</td>
                <td>{row.quantity}</td>
                <td>£{(row.totalPricePence / 100).toFixed(2)}</td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {ammunitionPurchases.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>No ammunition purchases recorded</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
