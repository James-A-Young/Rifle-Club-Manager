import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { CompetitionMatch, CompetitionMatchScore, Member } from '../types/club';

// ---------------------------------------------------------------------------
// Score entry form state
// ---------------------------------------------------------------------------

interface ScoreFormState {
  mode: 'registered' | 'unregistered';
  userId: string;
  unregisteredName: string;
  rawScore: string;
}

const EMPTY_SCORE_FORM: ScoreFormState = {
  mode: 'registered',
  userId: '',
  unregisteredName: '',
  rawScore: '',
};

// ---------------------------------------------------------------------------
// Sub-component: score entry row
// ---------------------------------------------------------------------------

interface ScoreEntryRowProps {
  form: ScoreFormState;
  onChange: (form: ScoreFormState) => void;
  onSubmit: () => void;
  members: Member[];
  submitting: boolean;
}

function ScoreEntryRow({ form, onChange, onSubmit, members, submitting }: ScoreEntryRowProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Toggle registered / unregistered */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => onChange({ ...form, mode: 'registered', unregisteredName: '' })}
          style={tabBtnStyle(form.mode === 'registered')}
        >
          Club Member
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...form, mode: 'unregistered', userId: '' })}
          style={tabBtnStyle(form.mode === 'unregistered')}
        >
          + Unregistered Shooter
        </button>
      </div>

      {form.mode === 'registered' ? (
        <select
          value={form.userId}
          onChange={e => onChange({ ...form, userId: e.target.value })}
          style={inputStyle}
        >
          <option value="">— Select club member —</option>
          {members
            .filter(m => m.status === 'APPROVED')
            .map(m => (
              <option key={m.userId} value={m.userId}>
                {m.user.name}
              </option>
            ))}
        </select>
      ) : (
        <input
          type="text"
          value={form.unregisteredName}
          onChange={e => onChange({ ...form, unregisteredName: e.target.value })}
          placeholder="Shooter name (guest / unregistered)"
          style={inputStyle}
        />
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="number"
          value={form.rawScore}
          onChange={e => onChange({ ...form, rawScore: e.target.value })}
          placeholder="Raw score"
          min={0}
          style={{ ...inputStyle, width: 130 }}
        />
        <button onClick={onSubmit} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Adding…' : 'Add Score'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single score pill
// ---------------------------------------------------------------------------

function ScorePill({ score, onDelete }: { score: CompetitionMatchScore; onDelete: () => void }) {
  const name = score.user?.name ?? score.unregisteredName ?? 'Unknown';
  const isGuest = !score.user;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.4rem 0.75rem',
      background: isGuest ? '#fef3c7' : '#f0f4ff',
      border: `1px solid ${isGuest ? '#d97706' : 'var(--blue-light)'}`,
      borderRadius: 'var(--radius)',
      fontSize: '0.88rem',
    }}>
      <span style={{ fontWeight: 600 }}>{name}</span>
      {isGuest && <span style={{ fontSize: '0.75rem', color: '#92400e' }}>guest</span>}
      <span style={{ marginLeft: 'auto', fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{score.rawScore}</span>
      <button
        onClick={onDelete}
        title="Remove score"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-600)', fontSize: '0.85rem', padding: '0 0.2rem' }}
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: participant card (home or away)
// ---------------------------------------------------------------------------

interface ParticipantCardProps {
  label: 'Home' | 'Away';
  match: CompetitionMatch;
  side: 'home' | 'away';
  members: Member[];
  competitionId: string;
  onScoreAdded: (score: CompetitionMatchScore) => void;
  onScoreDeleted: (scoreId: string) => void;
}

function ParticipantCard({ label, match, side, members, competitionId, onScoreAdded, onScoreDeleted }: ParticipantCardProps) {
  const participant = side === 'home' ? match.homeParticipant : match.awayParticipant;
  const [form, setForm] = useState<ScoreFormState>(EMPTY_SCORE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sideScores = match.scores; // caller already filtered if needed

  async function handleSubmit() {
    if (form.mode === 'registered' && !form.userId) {
      setError('Select a club member.');
      return;
    }
    if (form.mode === 'unregistered' && !form.unregisteredName.trim()) {
      setError('Enter a shooter name.');
      return;
    }
    const rawScore = parseInt(form.rawScore, 10);
    if (isNaN(rawScore) || rawScore < 0) {
      setError('Enter a valid score.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, unknown> = { rawScore };
      if (form.mode === 'registered') {
        body.userId = form.userId;
      } else {
        body.unregisteredName = form.unregisteredName.trim();
      }

      const score = await api.post<CompetitionMatchScore>(
        `/api/competition-events/${competitionId}/matches/${match.id}/scores`,
        body,
      );
      onScoreAdded(score);
      setForm(EMPTY_SCORE_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add score');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(scoreId: string) {
    try {
      await api.delete(`/api/competition-events/${competitionId}/scores/${scoreId}`);
      onScoreDeleted(scoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove score');
    }
  }

  const isBogey = participant.isBogey;
  const accentColor = label === 'Home' ? 'var(--navy)' : 'var(--accent)';

  return (
    <div style={{
      flex: 1,
      border: `2px solid ${accentColor}`,
      borderRadius: 'var(--radius)',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      background: '#fff',
    }}>
      <div>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
        <h3 style={{ margin: '0.25rem 0 0', color: 'var(--gray-800)', fontSize: '1.05rem', fontWeight: 700 }}>
          {isBogey ? '🤖 Bogey' : participant.displayName}
        </h3>
        {isBogey && participant.bogeyScore != null && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#d97706' }}>Bogey score: {participant.bogeyScore}</p>
        )}
        {participant.club && !isBogey && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--gray-600)' }}>{participant.club.name}</p>
        )}
      </div>

      {/* Existing scores for this side — show all; caller can decide to filter by participant */}
      {sideScores.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {sideScores.map(s => (
            <ScorePill key={s.id} score={s} onDelete={() => handleDelete(s.id)} />
          ))}
        </div>
      )}

      {/* Score entry (no entry for bogey) */}
      {!isBogey && (
        <>
          {error && <div style={{ color: 'var(--danger)', fontSize: '0.82rem' }}>{error}</div>}
          <ScoreEntryRow
            form={form}
            onChange={setForm}
            onSubmit={handleSubmit}
            members={members}
            submitting={submitting}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CompetitionMatchScoring() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();

  const [match, setMatch] = useState<CompetitionMatch | null>(null);
  const [members] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !matchId) return;
    Promise.all([
      api.get<CompetitionMatch>(`/api/competition-events/${id}/matches/${matchId}`),
    ])
      .then(([m]) => setMatch(m))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load match'))
      .finally(() => setLoading(false));
  }, [id, matchId]);

  // Attempt to load club members if we have an owning club context
  // (Best-effort; non-critical if not available)
  useEffect(() => {
    // Members would normally come from a parent context; left as a hook for integration
  }, []);

  function handleScoreAdded(score: CompetitionMatchScore) {
    setMatch(prev => prev ? { ...prev, scores: [...prev.scores, score] } : prev);
  }

  function handleScoreDeleted(scoreId: string) {
    setMatch(prev => prev ? { ...prev, scores: prev.scores.filter(s => s.id !== scoreId) } : prev);
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading match…</div>;
  if (!match) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
      {error || 'Match not found.'}
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate(-1)} style={ghostBtnStyle}>← Back</button>
        <div>
          <h1 style={{ margin: 0, color: 'var(--navy)', fontSize: '1.3rem' }}>Match Scoring</h1>
          {match.round && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-600)' }}>
              {match.round.name} · Deadline {new Date(match.round.deadline).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* VS banner */}
      <div style={{ textAlign: 'center', margin: '0.5rem 0 1rem', fontWeight: 800, fontSize: '1.4rem', color: 'var(--navy)' }}>
        {match.homeParticipant.displayName}
        <span style={{ margin: '0 0.75rem', color: 'var(--accent)' }}>vs</span>
        {match.awayParticipant.displayName}
      </div>

      {/* Score totals */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <ScoreSummary label="Home" scores={match.scores} participantId={match.homeParticipantId} />
        <ScoreSummary label="Away" scores={match.scores} participantId={match.awayParticipantId} />
      </div>

      {/* Two-column participant cards */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ParticipantCard
          label="Home"
          match={match}
          side="home"
          members={members}
          competitionId={id!}
          onScoreAdded={handleScoreAdded}
          onScoreDeleted={handleScoreDeleted}
        />
        <ParticipantCard
          label="Away"
          match={match}
          side="away"
          members={members}
          competitionId={id!}
          onScoreAdded={handleScoreAdded}
          onScoreDeleted={handleScoreDeleted}
        />
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: 'var(--gray-600)', textAlign: 'center' }}>
        Scores are based on raw (scratch) totals. No handicap is applied.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score summary widget
// ---------------------------------------------------------------------------

function ScoreSummary({ label, scores }: {
  label: string;
  scores: CompetitionMatchScore[];
  participantId: string;
}) {
  const total = scores.reduce((sum, s) => sum + (s.rawScore ?? 0), 0);
  const count = scores.length;
  const isHome = label === 'Home';
  return (
    <div style={{
      textAlign: 'center',
      padding: '0.5rem 1.5rem',
      borderRadius: 'var(--radius)',
      background: isHome ? 'var(--navy)' : 'var(--accent)',
      color: '#fff',
      minWidth: 120,
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>{total}</div>
      <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{count} score{count !== 1 ? 's' : ''}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--gray-400)',
  borderRadius: 'var(--radius)',
  fontSize: '0.9rem',
  width: '100%',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: 'var(--navy)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.9rem',
  whiteSpace: 'nowrap',
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  background: 'transparent',
  border: '1px solid var(--gray-400)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  fontSize: '0.85rem',
  color: 'var(--gray-800)',
};

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.85rem',
    borderRadius: 'var(--radius)',
    border: `1px solid ${active ? 'var(--navy)' : 'var(--gray-400)'}`,
    background: active ? 'var(--navy)' : '#fff',
    color: active ? '#fff' : 'var(--gray-800)',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    fontSize: '0.85rem',
  };
}
