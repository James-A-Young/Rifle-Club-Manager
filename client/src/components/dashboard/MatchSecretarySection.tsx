import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Season, Competition, CompetitionEntry, ScoreSheet, Member } from '../../types/club';
import ScoreGrid from './ScoreGrid';
import CompetitionForm, { CompetitionFormData } from './CompetitionForm';

interface Props {
  clubId: string;
  members: Member[];
}

export default function MatchSecretarySection({ clubId, members }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Season form state
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [creatingSeason, setCreatingSeason] = useState(false);

  // Competition form state
  const [showCompetitionForm, setShowCompetitionForm] = useState(false);

  // Per-competition UI state: open accordion, score sheet, enrolment
  const [openCompId, setOpenCompId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Record<string, ScoreSheet>>({});
  const [sheetLoading, setSheetLoading] = useState<Record<string, boolean>>({});
  const [enrolledMembers, setEnrolledMembers] = useState<Record<string, CompetitionEntry[]>>({});
  const [enrollTab, setEnrollTab] = useState<Record<string, 'scores' | 'members'>>({});

  const approvedMembers = members.filter(m => m.status === 'APPROVED');

  const loadSeasons = useCallback(async () => {
    try {
      const data = await api.get<Season[]>(`/api/clubs/${clubId}/scoring/seasons`);
      setSeasons(data);
      if (data.length > 0 && !selectedSeasonId) {
        setSelectedSeasonId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading seasons');
    }
  }, [clubId, selectedSeasonId]);

  const loadCompetitions = useCallback(async (seasonId: string) => {
    if (!seasonId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.get<Competition[]>(`/api/clubs/${clubId}/scoring/seasons/${seasonId}/competitions`);
      setCompetitions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading competitions');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { loadSeasons(); }, [loadSeasons]);

  useEffect(() => {
    if (selectedSeasonId) {
      setCompetitions([]);
      setOpenCompId(null);
      loadCompetitions(selectedSeasonId);
    }
  }, [selectedSeasonId, loadCompetitions]);

  async function createSeason() {
    if (!newSeasonName.trim()) return;
    setCreatingSeason(true);
    try {
      const season = await api.post<Season>(`/api/clubs/${clubId}/scoring/seasons`, { name: newSeasonName.trim() });
      setSeasons(prev => [season, ...prev]);
      setSelectedSeasonId(season.id);
      setNewSeasonName('');
      setShowSeasonForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating season');
    } finally {
      setCreatingSeason(false);
    }
  }

  async function createCompetition(data: CompetitionFormData) {
    try {
      const comp = await api.post<Competition>(`/api/clubs/${clubId}/scoring/competitions`, data);
      setCompetitions(prev => [...prev, comp]);
      setShowCompetitionForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating competition');
    }
  }

  async function deleteCompetition(compId: string) {
    if (!confirm('Delete this competition and all its scores? This cannot be undone.')) return;
    try {
      await api.delete(`/api/clubs/${clubId}/scoring/competitions/${compId}`);
      setCompetitions(prev => prev.filter(c => c.id !== compId));
      if (openCompId === compId) setOpenCompId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting competition');
    }
  }

  async function loadScoreSheet(compId: string) {
    if (sheets[compId]) return;
    setSheetLoading(prev => ({ ...prev, [compId]: true }));
    try {
      const sheet = await api.get<ScoreSheet>(`/api/clubs/${clubId}/scoring/competitions/${compId}/scoresheet`);
      setSheets(prev => ({ ...prev, [compId]: sheet }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading score sheet');
    } finally {
      setSheetLoading(prev => ({ ...prev, [compId]: false }));
    }
  }

  async function loadEnrolledMembers(compId: string) {
    try {
      const data = await api.get<CompetitionEntry[]>(`/api/clubs/${clubId}/scoring/competitions/${compId}/members`);
      setEnrolledMembers(prev => ({ ...prev, [compId]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading enrolled members');
    }
  }

  async function toggleOpen(compId: string) {
    if (openCompId === compId) {
      setOpenCompId(null);
      return;
    }
    setOpenCompId(compId);
    if (!enrollTab[compId]) {
      setEnrollTab(prev => ({ ...prev, [compId]: 'scores' }));
    }
    await Promise.all([loadScoreSheet(compId), loadEnrolledMembers(compId)]);
  }

  async function enrolMember(compId: string, userId: string) {
    try {
      await api.post(`/api/clubs/${clubId}/scoring/competitions/${compId}/members`, { userIds: [userId] });
      await loadEnrolledMembers(compId);
      // Reload score sheet so new rows appear
      setSheets(prev => { const n = { ...prev }; delete n[compId]; return n; });
      await loadScoreSheet(compId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error enrolling member');
    }
  }

  async function unenrolMember(compId: string, userId: string) {
    try {
      await api.delete(`/api/clubs/${clubId}/scoring/competitions/${compId}/members/${userId}`);
      await loadEnrolledMembers(compId);
      setSheets(prev => { const n = { ...prev }; delete n[compId]; return n; });
      await loadScoreSheet(compId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error removing member');
    }
  }

  function handleScoreUpdated(compId: string, scoreId: string, value: number | null) {
    setSheets(prev => {
      const sheet = prev[compId];
      if (!sheet) return prev;
      return {
        ...prev,
        [compId]: {
          ...sheet,
          rounds: sheet.rounds.map(r => ({
            ...r,
            scores: r.scores.map(s => s.id === scoreId ? { ...s, score: value } : s),
          })),
        },
      };
    });
  }

  async function archiveSeason(seasonId: string, isArchived: boolean) {
    try {
      await api.patch(`/api/clubs/${clubId}/scoring/seasons/${seasonId}`, { isArchived });
      setSeasons(prev => prev.map(s => s.id === seasonId ? { ...s, isArchived } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating season');
    }
  }

  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);

  return (
    <>
      <section>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2>Match Secretary</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSeasonForm(s => !s)}>
            + New Season
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {showSeasonForm && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label>Season Name</label>
              <input
                value={newSeasonName}
                onChange={e => setNewSeasonName(e.target.value)}
                placeholder="e.g. 2024/25"
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={createSeason} disabled={creatingSeason || !newSeasonName.trim()}>
              {creatingSeason ? 'Creating…' : 'Create'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSeasonForm(false)}>
              Cancel
            </button>
          </div>
        )}

        {seasons.length === 0 ? (
          <p style={{ color: 'var(--gray-600)' }}>No seasons yet. Create a season to get started.</p>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label style={{ fontWeight: 500, marginBottom: 0 }}>Season:</label>
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              style={{ width: 'auto', minWidth: 200 }}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isArchived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            {selectedSeason && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => archiveSeason(selectedSeason.id, !selectedSeason.isArchived)}
              >
                {selectedSeason.isArchived ? 'Unarchive' : 'Archive'}
              </button>
            )}
          </div>
        )}
      </section>

      {selectedSeasonId && (
        <section>
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <h2>Competitions</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCompetitionForm(s => !s)}>
              + Add Competition
            </button>
          </div>

          {showCompetitionForm && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '1rem', marginBottom: '1rem', border: '1px solid var(--gray-200)' }}>
              <h3>New Competition</h3>
              <CompetitionForm
                seasonId={selectedSeasonId}
                onSubmit={createCompetition}
                onCancel={() => setShowCompetitionForm(false)}
              />
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--gray-600)' }}>Loading…</p>
          ) : competitions.length === 0 ? (
            <p style={{ color: 'var(--gray-600)' }}>No competitions in this season yet.</p>
          ) : (
            competitions.map(comp => {
              const isOpen = openCompId === comp.id;
              const tab = enrollTab[comp.id] ?? 'scores';
              const sheet = sheets[comp.id];
              const enrolled = enrolledMembers[comp.id] ?? [];
              const enrolledIds = new Set(enrolled.map(e => e.userId));
              const notEnrolled = approvedMembers.filter(m => !enrolledIds.has(m.userId));

              return (
                <div key={comp.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 6, marginBottom: '0.75rem', overflow: 'hidden' }}>
                  {/* Accordion header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: isOpen ? 'var(--gray-100)' : 'var(--white)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => toggleOpen(comp.id)}
                  >
                    <div>
                      <strong>{comp.name}</strong>
                      {comp.organiser && <span style={{ color: 'var(--gray-600)', marginLeft: '0.5rem', fontSize: '0.875rem' }}>{comp.organiser}</span>}
                      <span style={{ color: 'var(--gray-600)', marginLeft: '0.75rem', fontSize: '0.8rem' }}>
                        {comp.roundCount} rounds × {comp.cardsPerRound} cards
                        {comp._count !== undefined && ` · ${comp._count.entries} members`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={e => { e.stopPropagation(); deleteCompetition(comp.id); }}
                      >
                        Delete
                      </button>
                      <span style={{ fontSize: '1.2rem', color: 'var(--gray-600)' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Accordion body */}
                  {isOpen && (
                    <div style={{ padding: '1rem', borderTop: '1px solid var(--gray-200)' }}>
                      {/* Sub-tab nav */}
                      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--gray-200)', marginBottom: '1rem' }}>
                        {(['scores', 'members'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setEnrollTab(prev => ({ ...prev, [comp.id]: t }))}
                            style={{
                              padding: '0.5rem 1rem',
                              border: 'none',
                              background: 'transparent',
                              borderBottom: tab === t ? '2px solid var(--blue-light)' : 'none',
                              color: tab === t ? 'var(--blue-light)' : 'var(--gray-600)',
                              fontWeight: tab === t ? 600 : 400,
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                            }}
                          >
                            {t === 'scores' ? 'Score Sheet' : 'Manage Members'}
                          </button>
                        ))}
                      </div>

                      {tab === 'scores' && (
                        <>
                          {sheetLoading[comp.id] ? (
                            <p style={{ color: 'var(--gray-600)' }}>Loading score sheet…</p>
                          ) : sheet ? (
                            <ScoreGrid
                              clubId={clubId}
                              sheet={sheet}
                              onScoreUpdated={(scoreId, value) => handleScoreUpdated(comp.id, scoreId, value)}
                            />
                          ) : (
                            <p style={{ color: 'var(--gray-600)' }}>Score sheet unavailable.</p>
                          )}
                        </>
                      )}

                      {tab === 'members' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          {/* Enrolled */}
                          <div>
                            <h4 style={{ marginBottom: '0.5rem' }}>Enrolled ({enrolled.length})</h4>
                            {enrolled.length === 0 ? (
                              <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>No members enrolled yet.</p>
                            ) : (
                              <table>
                                <tbody>
                                  {enrolled.map(entry => (
                                    <tr key={entry.userId}>
                                      <td>{entry.user.name}</td>
                                      <td style={{ color: 'var(--gray-600)', fontSize: '0.8rem' }}>{entry.user.email}</td>
                                      <td>
                                        <button
                                          className="btn btn-danger btn-sm"
                                          onClick={() => unenrolMember(comp.id, entry.userId)}
                                        >
                                          Remove
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          {/* Not enrolled */}
                          <div>
                            <h4 style={{ marginBottom: '0.5rem' }}>Available Members</h4>
                            {notEnrolled.length === 0 ? (
                              <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>All approved members are enrolled.</p>
                            ) : (
                              <table>
                                <tbody>
                                  {notEnrolled.map(m => (
                                    <tr key={m.userId}>
                                      <td>{m.user.name}</td>
                                      <td style={{ color: 'var(--gray-600)', fontSize: '0.8rem' }}>{m.user.email}</td>
                                      <td>
                                        <button
                                          className="btn btn-primary btn-sm"
                                          onClick={() => enrolMember(comp.id, m.userId)}
                                        >
                                          Enrol
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}
    </>
  );
}
