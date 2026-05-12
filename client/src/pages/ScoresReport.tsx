import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Season, Competition } from '../types/club';

interface Club {
  id: string;
  name: string;
}

interface ReportRow {
  userId: string;
  name: string;
  email: string;
  totalCardsShot: number;
  allTimeAverage: number | null;
  last10Average: number | null;
  bestScore: number | null;
}

export default function ScoresReport() {
  const { id } = useParams<{ id: string }>();
  const [club, setClub] = useState<Club | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<Club>(`/api/clubs/${id}`),
      api.get<Season[]>(`/api/clubs/${id}/scoring/seasons`),
    ]).then(([c, s]) => {
      setClub(c);
      setSeasons(s);
    }).catch(e => setError(e instanceof Error ? e.message : 'Error loading'));
  }, [id]);

  useEffect(() => {
    if (!id || !selectedSeasonId) {
      setCompetitions([]);
      setSelectedCompetitionId('');
      return;
    }
    api.get<Competition[]>(`/api/clubs/${id}/scoring/seasons/${selectedSeasonId}/competitions`)
      .then(c => setCompetitions(c))
      .catch(() => setCompetitions([]));
  }, [id, selectedSeasonId]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedSeasonId) params.set('seasonId', selectedSeasonId);
    if (selectedCompetitionId) params.set('competitionId', selectedCompetitionId);
    const qs = params.toString();
    api.get<ReportRow[]>(`/api/clubs/${id}/scoring/report${qs ? '?' + qs : ''}`)
      .then(data => setRows(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Error loading report'))
      .finally(() => setLoading(false));
  }, [id, selectedSeasonId, selectedCompetitionId]);

  async function exportCsv() {
    if (!id) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (selectedSeasonId) params.set('seasonId', selectedSeasonId);
      if (selectedCompetitionId) params.set('competitionId', selectedCompetitionId);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clubs/${id}/scoring/report?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scores-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export error');
    } finally {
      setExporting(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{club?.name ?? 'Club'} — Scores Report</h1>
        </div>
        <div className="actions">
          <Link to={`/clubs/${id}`} className="btn btn-secondary btn-sm">← Back to Dashboard</Link>
          <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={exporting || loading}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Season</label>
            <select value={selectedSeasonId} onChange={e => { setSelectedSeasonId(e.target.value); setSelectedCompetitionId(''); }}>
              <option value="">All seasons</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Competition</label>
            <select
              value={selectedCompetitionId}
              onChange={e => setSelectedCompetitionId(e.target.value)}
              disabled={!selectedSeasonId}
            >
              <option value="">All competitions</option>
              {competitions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Search member</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or email…" />
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--gray-600)' }}>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Cards Shot</th>
                <th>All-Time Avg</th>
                <th>Last 10 Avg</th>
                <th>Best Score</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.userId}>
                  <td>{row.name}</td>
                  <td style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>{row.email}</td>
                  <td>{row.totalCardsShot}</td>
                  <td>{row.allTimeAverage !== null ? row.allTimeAverage.toFixed(2) : '—'}</td>
                  <td>{row.last10Average !== null ? row.last10Average.toFixed(2) : '—'}</td>
                  <td>{row.bestScore !== null ? row.bestScore : '—'}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
