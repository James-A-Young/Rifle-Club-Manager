import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { CompetitionEventDetail, CompetitionMatch } from '../types/club';

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CompetitionEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<CompetitionEventDetail>(`/api/competition-events/${id}`)
      .then(setEvent)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load competition'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!event) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
      {error || 'Competition not found.'}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/competitions')} style={ghostBtnStyle}>← All Competitions</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, color: 'var(--navy)', fontSize: '1.4rem' }}>{event.name}</h1>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            <Badge label={event.format} />
            <Badge label={event.type} />
          </div>
        </div>
        <Link
          to={`/competitions/${id}/divisions`}
          style={{ ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}
        >
          ✏️ Edit Divisions
        </Link>
      </div>

      {error && (
        <div style={{ background: '#fee', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {event.divisions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--gray-600)' }}>
          <p>No divisions yet.</p>
          <Link to={`/competitions/${id}/divisions`} style={primaryBtnStyle}>Set Up Divisions →</Link>
        </div>
      ) : (
        <>
          {/* Divisions overview */}
          {event.divisions.map(div => (
            <section key={div.id} style={cardStyle}>
              <h2 style={sectionHeadStyle}>{div.name}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {div.participants.map(p => (
                  <span key={p.id} style={{
                    padding: '0.25rem 0.6rem',
                    borderRadius: 99,
                    background: p.isBogey ? '#fef3c7' : 'var(--gray-100)',
                    border: `1px solid ${p.isBogey ? '#d97706' : 'var(--gray-400)'}`,
                    fontSize: '0.82rem',
                    fontWeight: p.isBogey ? 700 : 400,
                  }}>
                    {p.isBogey ? '🤖 Bogey' : p.displayName}
                  </span>
                ))}
              </div>
            </section>
          ))}

          {/* Rounds & Matches */}
          {event.rounds.map(round => (
            <section key={round.id} style={cardStyle}>
              <h2 style={sectionHeadStyle}>
                {round.name}
                <span style={{ fontWeight: 400, fontSize: '0.82rem', color: 'var(--gray-600)', marginLeft: '0.75rem' }}>
                  Deadline: {new Date(round.deadline).toLocaleDateString()}
                </span>
              </h2>
              {round.matches.length === 0 ? (
                <p style={{ color: 'var(--gray-600)', fontSize: '0.88rem' }}>No matches in this round.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {round.matches.map((match: CompetitionMatch) => (
                    <MatchRow key={match.id} match={match} competitionId={id!} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function MatchRow({ match, competitionId }: { match: CompetitionMatch; competitionId: string }) {
  const hasScores = match.scores.length > 0;
  return (
    <Link
      to={`/competitions/${competitionId}/matches/${match.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 0.9rem',
        background: 'var(--gray-50)',
        border: '1px solid var(--gray-200)',
        borderRadius: 'var(--radius)',
        textDecoration: 'none',
        color: 'inherit',
        fontWeight: 500,
        fontSize: '0.9rem',
        transition: 'background 0.15s',
      }}
    >
      <span style={{ flex: 1 }}>
        {match.homeParticipant.isBogey ? '🤖 Bogey' : match.homeParticipant.displayName}
      </span>
      <span style={{ color: 'var(--gray-600)', fontWeight: 400 }}>vs</span>
      <span style={{ flex: 1, textAlign: 'right' }}>
        {match.awayParticipant.isBogey ? '🤖 Bogey' : match.awayParticipant.displayName}
      </span>
      {hasScores && (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>
          {match.scores.length} score{match.scores.length !== 1 ? 's' : ''}
        </span>
      )}
      <span style={{ color: 'var(--blue-light)', fontSize: '0.82rem' }}>→</span>
    </Link>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span style={{
      padding: '0.2rem 0.6rem',
      background: 'var(--gray-200)',
      borderRadius: 99,
      fontSize: '0.78rem',
      fontWeight: 700,
      letterSpacing: 0.5,
      color: 'var(--gray-800)',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--gray-200)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  marginBottom: '1rem',
  boxShadow: 'var(--shadow)',
};

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--navy)',
  marginBottom: '0.75rem',
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

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: 'var(--navy)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.9rem',
};
