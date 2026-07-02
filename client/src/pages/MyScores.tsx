import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { MemberScoreHistoryResponse } from '../types/club';

interface Club {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

function toStartOfDayIso(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(dateValue: string): string {
  return new Date(`${dateValue}T23:59:59.999Z`).toISOString();
}

export default function MyScores() {
  const { id } = useParams<{ id: string }>();
  const isAllClubsMode = id === 'all';
  const [club, setClub] = useState<Club | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MemberScoreHistoryResponse>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 0,
    rows: [],
  });

  const [page, setPage] = useState(1);
  const [competitionQuery, setCompetitionQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [shotFrom, setShotFrom] = useState('');
  const [shotTo, setShotTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    if (competitionQuery.trim()) params.set('q', competitionQuery.trim());
    if (discipline.trim()) params.set('discipline', discipline.trim());
    if (shotFrom) params.set('shotFrom', toStartOfDayIso(shotFrom));
    if (shotTo) params.set('shotTo', toEndOfDayIso(shotTo));
    if (dueFrom) params.set('dueFrom', toStartOfDayIso(dueFrom));
    if (dueTo) params.set('dueTo', toEndOfDayIso(dueTo));
    if (minScore.trim()) params.set('minScore', minScore.trim());
    if (maxScore.trim()) params.set('maxScore', maxScore.trim());
    return params.toString();
  }, [competitionQuery, discipline, dueFrom, dueTo, maxScore, minScore, page, shotFrom, shotTo]);

  const effectiveClubId = isAllClubsMode ? selectedClubId : (id ?? '');
  const activeClubName = isAllClubsMode
    ? (clubs.find(c => c.id === selectedClubId)?.name ?? 'Select a Club')
    : (club?.name ?? 'Club');

  useEffect(() => {
    if (!id) return;
    if (isAllClubsMode) {
      setClub(null);
      api.get<Club[]>('/api/clubs')
        .then(setClubs)
        .catch(e => setError(e instanceof Error ? e.message : 'Error loading clubs'));
      return;
    }
    setClubs([]);
    setSelectedClubId('');
    api.get<Club>(`/api/clubs/${id}`)
      .then(setClub)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading club'));
  }, [id, isAllClubsMode]);

  useEffect(() => {
    if (!id) return;
    if (!effectiveClubId) {
      setLoading(false);
      setHistory({
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
        totalPages: 0,
        rows: [],
      });
      return;
    }
    setLoading(true);
    setError('');
    api.get<MemberScoreHistoryResponse>(`/api/clubs/${effectiveClubId}/scoring/mine/history?${queryString}`)
      .then(setHistory)
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading scores'))
      .finally(() => setLoading(false));
  }, [id, effectiveClubId, queryString]);

  function onFilterChange<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  async function exportCsv() {
    if (!effectiveClubId) return;
    setExporting(true);
    setError('');
    const params = new URLSearchParams(queryString);
    params.delete('page');
    params.delete('pageSize');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clubs/${effectiveClubId}/scoring/mine/history/export.csv?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-score-history.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>{activeClubName} - My Scores</h1>
        <div className="actions">
          <Link className="btn btn-secondary btn-sm" to="/">Back to Dashboard</Link>
          <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={exporting || loading || !effectiveClubId}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          {isAllClubsMode && (
            <div className="form-group" style={{ marginBottom: 0, minWidth: 240 }}>
              <label htmlFor="clubId">Club</label>
              <select
                id="clubId"
                value={selectedClubId}
                onChange={e => {
                  setSelectedClubId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Select a club</option>
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0, minWidth: 210 }}>
            <label htmlFor="competitionQuery">Competition</label>
            <input
              id="competitionQuery"
              value={competitionQuery}
              onChange={e => onFilterChange(setCompetitionQuery, e.target.value)}
              placeholder="Search by competition"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label htmlFor="discipline">Discipline</label>
            <input
              id="discipline"
              value={discipline}
              onChange={e => onFilterChange(setDiscipline, e.target.value)}
              placeholder="e.g. Air Rifle"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="shotFrom">Date Shot From</label>
            <input type="date" id="shotFrom" value={shotFrom} onChange={e => onFilterChange(setShotFrom, e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="shotTo">Date Shot To</label>
            <input type="date" id="shotTo" value={shotTo} onChange={e => onFilterChange(setShotTo, e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="dueFrom">Date Due From</label>
            <input type="date" id="dueFrom" value={dueFrom} onChange={e => onFilterChange(setDueFrom, e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="dueTo">Date Due To</label>
            <input type="date" id="dueTo" value={dueTo} onChange={e => onFilterChange(setDueTo, e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
            <label htmlFor="minScore">Min Score</label>
            <input
              type="number"
              id="minScore"
              min={0}
              max={10000}
              step="0.01"
              value={minScore}
              onChange={e => onFilterChange(setMinScore, e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: 110 }}>
            <label htmlFor="maxScore">Max Score</label>
            <input
              type="number"
              id="maxScore"
              min={0}
              max={10000}
              step="0.01"
              value={maxScore}
              onChange={e => onFilterChange(setMaxScore, e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--gray-600)' }}>Loading...</p>
        ) : isAllClubsMode && !selectedClubId ? (
          <p style={{ color: 'var(--gray-600)' }}>Select a club to view score history.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Discipline</th>
                  <th>Date Shot</th>
                  <th>Date Due</th>
                  <th>Round</th>
                  <th>Card</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map(row => (
                  <tr key={row.scoreId}>
                    <td>{row.competitionName}</td>
                    <td>{row.discipline}</td>
                    <td>{new Date(row.dateShot).toLocaleDateString()}</td>
                    <td>{new Date(row.dateDue).toLocaleDateString()}</td>
                    <td>{row.roundNumber}</td>
                    <td>{row.cardNumber}</td>
                    <td>{row.score}</td>
                  </tr>
                ))}
                {history.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                      No scores found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <span style={{ color: 'var(--gray-600)' }}>
                Page {history.page} of {Math.max(history.totalPages, 1)} ({history.total} scores)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={history.page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={history.totalPages === 0 || history.page >= history.totalPages}
                  onClick={() => setPage(p => Math.min(history.totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
