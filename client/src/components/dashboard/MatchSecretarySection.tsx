import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Season, Competition, CompetitionEntry, ScoreSheet, Member, PracticeCardRecord } from '../../types/club';
import ScoreGrid from './ScoreGrid';
import CompetitionForm, { CompetitionFormData } from './CompetitionForm';

const SHOW_ARCHIVED_STORAGE_KEY = 'matchSecretary.showArchivedSeasons';

interface Props {
  clubId: string;
  members: Member[];
  disciplineOptions: string[];
}

interface CompetitionEditRound {
  roundNumber: number;
  dueDate: string;
}

interface CompetitionEditForm {
  name: string;
  organiser: string;
  discipline: string;
  roundCount: number;
  cardsPerRound: number;
  rounds: CompetitionEditRound[];
}

interface PracticeCardForm {
  userId: string;
  discipline: string;
  score: string;
  recordedAt: string;
}

function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export default function MatchSecretarySection({ clubId, members, disciplineOptions }: Props) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Season form state
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [showPracticeCards, setShowPracticeCards] = useState(true);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [creatingSeason, setCreatingSeason] = useState(false);
  const [showArchivedSeasons, setShowArchivedSeasons] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SHOW_ARCHIVED_STORAGE_KEY) === 'true';
  });

  // Competition form state
  const [showCompetitionForm, setShowCompetitionForm] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CompetitionEditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Practice card form state
  const [practiceForm, setPracticeForm] = useState<PracticeCardForm>({
    userId: '',
    discipline: disciplineOptions[0] ?? '',
    score: '',
    recordedAt: new Date().toISOString().slice(0, 10),
  });
  const [practiceSaving, setPracticeSaving] = useState(false);
  const [deletingPracticeCardId, setDeletingPracticeCardId] = useState<string | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceCards, setPracticeCards] = useState<PracticeCardRecord[]>([]);

  // Per-competition UI state: open accordion, score sheet, enrolment
  const [openCompId, setOpenCompId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Record<string, ScoreSheet>>({});
  const [sheetLoading, setSheetLoading] = useState<Record<string, boolean>>({});
  const [enrolledMembers, setEnrolledMembers] = useState<Record<string, CompetitionEntry[]>>({});
  const [enrollTab, setEnrollTab] = useState<Record<string, 'scores' | 'members'>>({});

  const approvedMembers = members.filter(m => m.status === 'APPROVED');

  useEffect(() => {
    if (!practiceForm.userId && approvedMembers.length > 0) {
      setPracticeForm(prev => ({ ...prev, userId: approvedMembers[0].userId }));
    }
  }, [approvedMembers, practiceForm.userId]);

  useEffect(() => {
    if (disciplineOptions.length === 0) return;
    const hasMatch = disciplineOptions.some(d => d.toLowerCase() === practiceForm.discipline.toLowerCase());
    if (!hasMatch) {
      setPracticeForm(prev => ({ ...prev, discipline: disciplineOptions[0] }));
    }
  }, [disciplineOptions, practiceForm.discipline]);

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

  const loadPracticeCards = useCallback(async () => {
    setPracticeLoading(true);
    try {
      const data = await api.get<PracticeCardRecord[]>(`/api/clubs/${clubId}/scoring/practice-cards/recent?limit=5`);
      setPracticeCards(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading practice cards');
    } finally {
      setPracticeLoading(false);
    }
  }, [clubId]);

  useEffect(() => { loadPracticeCards(); }, [loadPracticeCards]);

  useEffect(() => {
    if (selectedSeasonId) {
      setCompetitions([]);
      setOpenCompId(null);
      loadCompetitions(selectedSeasonId);
    }
  }, [selectedSeasonId, loadCompetitions]);

  useEffect(() => {
    const visible = showArchivedSeasons ? seasons : seasons.filter(s => !s.isArchived);
    if (visible.length === 0) {
      if (selectedSeasonId) setSelectedSeasonId('');
      return;
    }
    const isSelectedVisible = visible.some(s => s.id === selectedSeasonId);
    if (!isSelectedVisible) {
      setSelectedSeasonId(visible[0].id);
    }
  }, [seasons, selectedSeasonId, showArchivedSeasons]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_ARCHIVED_STORAGE_KEY, String(showArchivedSeasons));
  }, [showArchivedSeasons]);

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

  function startEditCompetition(comp: Competition) {
    setError('');
    setOpenCompId(comp.id);
    setEditingCompId(comp.id);
    setEditForm({
      name: comp.name,
      organiser: comp.organiser ?? '',
      discipline: comp.discipline,
      roundCount: comp.roundCount,
      cardsPerRound: comp.cardsPerRound,
      rounds: comp.rounds
        .slice()
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map(r => ({ roundNumber: r.roundNumber, dueDate: toDateInputValue(r.dueDate) })),
    });
  }

  function cancelEditCompetition() {
    setEditingCompId(null);
    setEditForm(null);
    setEditSaving(false);
  }

  function updateEditRoundCount(roundCount: number) {
    setEditForm(prev => {
      if (!prev) return prev;
      const nextCount = Math.max(1, Math.min(52, roundCount));
      const nextRounds = prev.rounds.slice(0, nextCount);
      while (nextRounds.length < nextCount) {
        nextRounds.push({ roundNumber: nextRounds.length + 1, dueDate: '' });
      }
      return {
        ...prev,
        roundCount: nextCount,
        rounds: nextRounds.map((r, i) => ({ ...r, roundNumber: i + 1 })),
      };
    });
  }

  function updateEditRoundDueDate(index: number, dueDate: string) {
    setEditForm(prev => {
      if (!prev) return prev;
      const rounds = prev.rounds.map((r, i) => (i === index ? { ...r, dueDate } : r));
      return { ...prev, rounds };
    });
  }

  async function saveCompetitionEdit(compId: string) {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setError('Competition name is required');
      return;
    }
    if (!editForm.discipline.trim()) {
      setError('Competition discipline is required');
      return;
    }
    if (editForm.rounds.length !== editForm.roundCount || editForm.rounds.some(r => !r.dueDate)) {
      setError('All rounds must have a due date');
      return;
    }

    setEditSaving(true);
    setError('');
    try {
      const updated = await api.patch<Competition>(`/api/clubs/${clubId}/scoring/competitions/${compId}`, {
        name: editForm.name.trim(),
        organiser: editForm.organiser.trim() || null,
        discipline: editForm.discipline.trim(),
        roundCount: editForm.roundCount,
        cardsPerRound: editForm.cardsPerRound,
        rounds: editForm.rounds.map(r => ({ roundNumber: r.roundNumber, dueDate: r.dueDate })),
      });

      setCompetitions(prev => prev.map(c => (c.id === compId ? updated : c)));
      setSheets(prev => {
        const next = { ...prev };
        delete next[compId];
        return next;
      });
      if (openCompId === compId) {
        await loadScoreSheet(compId);
      }
      cancelEditCompetition();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error updating competition');
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteFinalRound(compId: string, roundNumber: number) {
    if (!confirm('Delete the final round? This can only be done when that round has no recorded scores.')) return;
    try {
      await api.delete(`/api/clubs/${clubId}/scoring/competitions/${compId}/rounds/${roundNumber}`);
      if (selectedSeasonId) {
        await loadCompetitions(selectedSeasonId);
      }
      setSheets(prev => {
        const next = { ...prev };
        delete next[compId];
        return next;
      });
      if (openCompId === compId) {
        await loadScoreSheet(compId);
      }
      cancelEditCompetition();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting round');
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

  async function createPracticeCard() {
    if (!practiceForm.userId) {
      setError('Select a member for the practice card');
      return;
    }
    if (!practiceForm.discipline.trim()) {
      setError('Discipline is required');
      return;
    }
    const parsedScore = Number(practiceForm.score);
    if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 10000) {
      setError('Score must be an integer between 0 and 10000');
      return;
    }

    setPracticeSaving(true);
    setError('');
    try {
      await api.post<PracticeCardRecord>(`/api/clubs/${clubId}/scoring/practice-cards`, {
        userId: practiceForm.userId,
        discipline: practiceForm.discipline,
        score: parsedScore,
        recordedAt: practiceForm.recordedAt ? `${practiceForm.recordedAt}T12:00:00.000Z` : undefined,
      });

      setPracticeForm(prev => ({ ...prev, score: '' }));
      await loadPracticeCards();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating practice card');
    } finally {
      setPracticeSaving(false);
    }
  }

  async function deletePracticeCard(practiceCardId: string) {
    if (!confirm('Delete this practice card? This cannot be undone.')) return;
    setDeletingPracticeCardId(practiceCardId);
    setError('');
    try {
      await api.delete(`/api/clubs/${clubId}/scoring/practice-cards/${practiceCardId}`);
      await loadPracticeCards();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting practice card');
    } finally {
      setDeletingPracticeCardId(null);
    }
  }

  const visibleSeasons = showArchivedSeasons ? seasons : seasons.filter(s => !s.isArchived);
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

        <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '1rem', marginBottom: '1rem', border: '1px solid var(--gray-200)' }}>
          <div className="page-header" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ marginBottom: 0 }}>Practice Cards</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPracticeCards(v => !v)}
              type="button"
            >
              {showPracticeCards ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {showPracticeCards && (
            <>
              {disciplineOptions.length === 0 && (
                <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                  No scoring disciplines configured for this club.
                  {' '}
                  <a href={`/clubs/${clubId}?tab=settings#disciplines-offered`} style={{ textDecoration: 'underline' }}>
                    Add disciplines in Club Settings
                  </a>
                </div>
              )}
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Member</label>
                  <select
                    value={practiceForm.userId}
                    onChange={e => setPracticeForm(prev => ({ ...prev, userId: e.target.value }))}
                  >
                    {approvedMembers.map(member => (
                      <option key={member.userId} value={member.userId}>{member.user.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Discipline</label>
                  {disciplineOptions.length > 0 ? (
                    <select
                      value={practiceForm.discipline}
                      onChange={e => setPracticeForm(prev => ({ ...prev, discipline: e.target.value }))}
                    >
                      {disciplineOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={practiceForm.discipline}
                      onChange={e => setPracticeForm(prev => ({ ...prev, discipline: e.target.value }))}
                      placeholder="e.g. Air Rifle Prone"
                    />
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Score</label>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={practiceForm.score}
                    onChange={e => setPracticeForm(prev => ({ ...prev, score: e.target.value }))}
                    placeholder="0-10000"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Date Shot</label>
                  <input
                    type="date"
                    value={practiceForm.recordedAt}
                    onChange={e => setPracticeForm(prev => ({ ...prev, recordedAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="actions" style={{ marginBottom: '0.75rem' }}>
                <button className="btn btn-primary btn-sm" disabled={practiceSaving || approvedMembers.length === 0 || disciplineOptions.length === 0} onClick={createPracticeCard}>
                  {practiceSaving ? 'Saving…' : 'Log Practice Card'}
                </button>
              </div>

              {practiceLoading ? (
                <p style={{ color: 'var(--gray-600)' }}>Loading recent practice cards…</p>
              ) : practiceCards.length === 0 ? (
                <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: 0 }}>No practice cards logged yet.</p>
              ) : (
                <>
                  <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Showing last 5 practice cards.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Discipline</th>
                        <th>Score</th>
                        <th>Date Shot</th>
                        <th>Logged By</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {practiceCards.map(card => (
                        <tr key={card.id}>
                          <td>{card.userName}</td>
                          <td>{card.discipline}</td>
                          <td>{card.score}</td>
                          <td>{new Date(card.recordedAt).toLocaleDateString()}</td>
                          <td>{card.createdByName}</td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              disabled={deletingPracticeCardId === card.id}
                              onClick={() => deletePracticeCard(card.id)}
                            >
                              {deletingPracticeCardId === card.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>

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
              disabled={visibleSeasons.length === 0}
            >
              {visibleSeasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isArchived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: 0, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={showArchivedSeasons}
                onChange={e => setShowArchivedSeasons(e.target.checked)}
              />
              Show archived
            </label>
            {visibleSeasons.length === 0 && (
              <span style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                No active seasons.
              </span>
            )}
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
              {disciplineOptions.length === 0 ? (
                <div className="alert alert-info">
                  No scoring disciplines configured for this club.
                  {' '}
                  <a href={`/clubs/${clubId}?tab=settings#disciplines-offered`} style={{ textDecoration: 'underline' }}>
                    Add disciplines in Club Settings
                  </a>
                </div>
              ) : (
                <CompetitionForm
                  seasonId={selectedSeasonId}
                  clubId={clubId}
                  disciplineOptions={disciplineOptions}
                  onSubmit={createCompetition}
                  onCancel={() => setShowCompetitionForm(false)}
                />
              )}
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
                      <span style={{ color: 'var(--gray-600)', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{comp.discipline}</span>
                      {comp.organiser && <span style={{ color: 'var(--gray-600)', marginLeft: '0.5rem', fontSize: '0.875rem' }}>{comp.organiser}</span>}
                      <span style={{ color: 'var(--gray-600)', marginLeft: '0.75rem', fontSize: '0.8rem' }}>
                        {comp.roundCount} rounds × {comp.cardsPerRound} cards
                        {comp._count !== undefined && ` · ${comp._count.entries} members`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => { e.stopPropagation(); startEditCompetition(comp); }}
                      >
                        Edit
                      </button>
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
                      {editingCompId === comp.id && editForm && (
                        <div style={{ background: 'var(--gray-50)', borderRadius: 6, padding: '1rem', marginBottom: '1rem', border: '1px solid var(--gray-200)' }}>
                          <h4 style={{ marginBottom: '0.75rem' }}>Edit Competition</h4>
                          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Competition Name *</label>
                              <input
                                value={editForm.name}
                                onChange={e => setEditForm(prev => prev ? { ...prev, name: e.target.value } : prev)}
                                placeholder="Competition name"
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Organiser</label>
                              <input
                                value={editForm.organiser}
                                onChange={e => setEditForm(prev => prev ? { ...prev, organiser: e.target.value } : prev)}
                                placeholder="Organiser"
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Discipline *</label>
                              {disciplineOptions.length > 0 ? (
                                <select
                                  value={editForm.discipline}
                                  onChange={e => setEditForm(prev => prev ? { ...prev, discipline: e.target.value } : prev)}
                                >
                                  {disciplineOptions.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={editForm.discipline}
                                  onChange={e => setEditForm(prev => prev ? { ...prev, discipline: e.target.value } : prev)}
                                  placeholder="Discipline"
                                />
                              )}
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Number of Rounds</label>
                              <input
                                type="number"
                                min={1}
                                max={52}
                                value={editForm.roundCount}
                                onChange={e => updateEditRoundCount(Number(e.target.value))}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Cards per Round</label>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={editForm.cardsPerRound}
                                onChange={e => {
                                  const value = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                                  setEditForm(prev => prev ? { ...prev, cardsPerRound: value } : prev);
                                }}
                              />
                            </div>
                          </div>

                          <div style={{ marginTop: '1rem' }}>
                            <h5 style={{ marginBottom: '0.5rem' }}>Round Due Dates</h5>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                              {editForm.rounds.map((round, index) => (
                                <div className="form-group" key={round.roundNumber} style={{ marginBottom: 0 }}>
                                  <label>Round {round.roundNumber} Due Date</label>
                                  <input
                                    type="date"
                                    value={round.dueDate}
                                    onChange={e => updateEditRoundDueDate(index, e.target.value)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="actions" style={{ marginTop: '1rem' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={editSaving}
                              onClick={() => saveCompetitionEdit(comp.id)}
                            >
                              {editSaving ? 'Saving…' : 'Save Changes'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={editSaving}
                              onClick={cancelEditCompetition}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={editSaving || editForm.roundCount <= 1}
                              onClick={() => deleteFinalRound(comp.id, comp.roundCount)}
                            >
                              Delete Final Round
                            </button>
                          </div>
                        </div>
                      )}

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
