import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

type TimeWindowPreset = '3m' | '6m' | '12m' | 'custom';
type VisitorTypeFilter = 'all' | 'guest' | 'member';

interface HistoryRow {
  id: string;
  publicVisitRef: string | null;
  purpose: string;
  timeIn: string;
  timeOut: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestClubRepresented: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  firearmUsed: {
    id: string;
    make: string;
    model: string;
    caliber: string;
    serialNumber: string;
  } | null;
}

interface HistoryResponse {
  rows: HistoryRow[];
  nextCursor: string | null;
}

interface LastVisitMember {
  userId: string;
  name: string;
  email: string;
  lastVisitAt: string | null;
}

interface SummaryResponse {
  lastVisitPerMember: LastVisitMember[];
  firearmLastUsed: {
    firearm: {
      id: string;
      serialNumber: string;
      make: string;
      model: string;
      caliber: string;
    } | null;
    lastUsedAt: string;
  } | null;
  attendanceCount: {
    attendee: {
      id: string;
      name: string;
      email: string;
    };
    count: number;
  } | null;
}

interface Club {
  id: string;
  name: string;
}

function toDateInputValue(value: Date): string {
  return value.toISOString().split('T')[0];
}

export default function ClubHistory() {
  const { id } = useParams<{ id: string }>();
  const [club, setClub] = useState<Club | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [timeWindowPreset, setTimeWindowPreset] = useState<TimeWindowPreset>('3m');
  const [fromDate, setFromDate] = useState(toDateInputValue(new Date(new Date().setMonth(new Date().getMonth() - 3))));
  const [toDate, setToDate] = useState(toDateInputValue(new Date()));
  const [memberId, setMemberId] = useState('');
  const [firearmSerial, setFirearmSerial] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [visitorType, setVisitorType] = useState<VisitorTypeFilter>('all');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('pageSize', '25');

    if (search) params.set('search', search);
    if (memberId) params.set('memberId', memberId);
    if (firearmSerial.trim()) params.set('firearmSerial', firearmSerial.trim());
    if (visitorType !== 'all') params.set('visitorType', visitorType);
    params.set('timeWindowPreset', timeWindowPreset);

    if (timeWindowPreset === 'custom') {
      if (fromDate) params.set('from', new Date(`${fromDate}T00:00:00.000Z`).toISOString());
      if (toDate) params.set('to', new Date(`${toDate}T23:59:59.999Z`).toISOString());
    }

    return params;
  }, [search, memberId, firearmSerial, visitorType, timeWindowPreset, fromDate, toDate]);

  const summaryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('timeWindowPreset', timeWindowPreset);
    if (timeWindowPreset === 'custom') {
      if (fromDate) params.set('from', new Date(`${fromDate}T00:00:00.000Z`).toISOString());
      if (toDate) params.set('to', new Date(`${toDate}T23:59:59.999Z`).toISOString());
    }

    if (memberId) params.set('memberId', memberId);
    if (firearmSerial.trim()) params.set('firearmSerial', firearmSerial.trim());
    if (attendeeEmail.trim()) params.set('attendeeEmail', attendeeEmail.trim());
    if (search) params.set('search', search);
    if (visitorType !== 'all') params.set('visitorType', visitorType);

    return params;
  }, [timeWindowPreset, fromDate, toDate, memberId, firearmSerial, attendeeEmail, search, visitorType]);

  async function loadHistory(reset = false) {
    if (!id) return;

    if (reset) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams(queryParams);
      const cursorToUse = reset ? null : nextCursor;
      if (cursorToUse) {
        params.set('cursor', cursorToUse);
      }

      const data = await api.get<HistoryResponse>(`/api/visits/club/${id}/history?${params.toString()}`);
      setRows(prev => (reset ? data.rows : [...prev, ...data.rows]));
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadSummary() {
    if (!id) return;
    setSummaryLoading(true);
    try {
      const data = await api.get<SummaryResponse>(`/api/visits/club/${id}/history/summary?${summaryParams.toString()}`);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;

    api.get<Club>(`/api/clubs/${id}`)
      .then(setClub)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load club history'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setNextCursor(null);
    void loadHistory(true);
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, summaryParams, id]);

  async function exportCsv() {
    if (!id) return;
    setExporting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/api/visits/club/${id}/history/export.csv?${params.toString()}`, {
        // credentials: 'include' sends the HttpOnly auth cookie automatically.
        // The Authorization header is retained as a fallback for API clients
        // that do not rely on the cookie.
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error?: string }).error ?? response.statusText);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `club-${id}-history.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Sign-In History</h1>
          <p style={{ color: 'var(--gray-600)', marginTop: '-0.5rem' }}>
            {club ? club.name : 'Loading club...'}
          </p>
        </div>
        <div className="actions">
          {id && <Link to={`/clubs/${id}`} className="btn btn-secondary btn-sm">Back to Club</Link>}
          <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2>Filters</h2>
        </div>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search (name, email, serial)</label>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Type to search"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Time Window</label>
            <select value={timeWindowPreset} onChange={e => setTimeWindowPreset(e.target.value as TimeWindowPreset)}>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Member ID (optional)</label>
            <input
              value={memberId}
              onChange={e => setMemberId(e.target.value)}
              placeholder="Filter by member userId"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Firearm Serial (optional)</label>
            <input
              value={firearmSerial}
              onChange={e => setFirearmSerial(e.target.value)}
              placeholder="Example: ABC123"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Attendance Person Email</label>
            <input
              value={attendeeEmail}
              onChange={e => setAttendeeEmail(e.target.value)}
              placeholder="For attendance count"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Visitor Type</label>
            <select value={visitorType} onChange={e => setVisitorType(e.target.value as VisitorTypeFilter)}>
              <option value="all">All visits</option>
              <option value="guest">Guests only</option>
              <option value="member">Members only</option>
            </select>
          </div>

          {timeWindowPreset === 'custom' && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2>Summary</h2>
          {summaryLoading && <span style={{ color: 'var(--gray-600)' }}>Refreshing...</span>}
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--gray-200)' }}>
            <h3>Last Time Firearm Was Used</h3>
            <p style={{ color: 'var(--gray-600)' }}>
              {summary?.firearmLastUsed
                ? `${summary.firearmLastUsed.firearm?.serialNumber ?? 'Unknown'} at ${new Date(summary.firearmLastUsed.lastUsedAt).toLocaleString()}`
                : 'Set firearm serial filter to inspect usage.'}
            </p>
          </div>
          <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--gray-200)' }}>
            <h3>Attendance Count</h3>
            <p style={{ color: 'var(--gray-600)' }}>
              {summary?.attendanceCount
                ? `${summary.attendanceCount.attendee.email}: ${summary.attendanceCount.count}`
                : 'Set attendee email to calculate count in selected window.'}
            </p>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Last Attendance Per Member</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.lastVisitPerMember ?? []).map(member => (
                <tr key={member.userId}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>{member.lastVisitAt ? new Date(member.lastVisitAt).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
              {(summary?.lastVisitPerMember ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                    No member attendance data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2>Sign-In History</h2>
          {!loading && <span style={{ color: 'var(--gray-600)' }}>Loaded {rows.length} rows</span>}
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Visitor Type</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Purpose</th>
                  <th>Firearm</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.user ? 'Member' : 'Guest'}</td>
                    <td>{row.user?.name ?? row.guestName ?? 'Guest Visitor'}</td>
                    <td>{row.user?.email ?? row.guestEmail ?? 'N/A'}</td>
                    <td>{row.purpose}</td>
                    <td>{row.firearmUsed ? `${row.firearmUsed.serialNumber} (${row.firearmUsed.make} ${row.firearmUsed.model})` : 'N/A'}</td>
                    <td>{new Date(row.timeIn).toLocaleString()}</td>
                    <td>{row.timeOut ? new Date(row.timeOut).toLocaleString() : 'Active'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                      No results for selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {nextCursor && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button className="btn btn-secondary" onClick={() => loadHistory(false)} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
