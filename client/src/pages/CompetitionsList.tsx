import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CompetitionEventSummary } from '../types/club';

export default function CompetitionsList() {
  const [events, setEvents] = useState<CompetitionEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<CompetitionEventSummary[]>('/api/competition-events')
      .then(setEvents)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load competitions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ color: 'var(--navy)', margin: 0 }}>Competitions</h1>
        <Link
          to="/competitions/new"
          style={{
            padding: '0.6rem 1.2rem',
            background: 'var(--navy)',
            color: '#fff',
            borderRadius: 'var(--radius)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          + New Competition
        </Link>
      </div>

      {error && (
        <div style={{ background: '#fee', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--gray-600)' }}>
          <p style={{ marginBottom: '1rem' }}>No competitions yet.</p>
          <Link
            to="/competitions/new"
            style={{ padding: '0.65rem 1.4rem', background: 'var(--navy)', color: '#fff', borderRadius: 'var(--radius)', textDecoration: 'none', fontWeight: 600 }}
          >
            Create your first competition →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {events.map(ev => (
            <Link
              key={ev.id}
              to={`/competitions/${ev.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                background: '#fff',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.15s',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '1rem' }}>{ev.name}</div>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                  <FormatBadge label={ev.format} />
                  <TypeBadge label={ev.type} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                <div>{ev._count.divisions} division{ev._count.divisions !== 1 ? 's' : ''}</div>
                <div>{ev._count.rounds} round{ev._count.rounds !== 1 ? 's' : ''}</div>
              </div>
              <span style={{ color: 'var(--blue-light)', fontSize: '1rem' }}>→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatBadge({ label }: { label: string }) {
  return (
    <span style={{
      padding: '0.15rem 0.5rem',
      background: 'var(--navy)',
      color: '#fff',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span style={{
      padding: '0.15rem 0.5rem',
      background: 'var(--gray-200)',
      color: 'var(--gray-800)',
      borderRadius: 99,
      fontSize: '0.72rem',
      fontWeight: 600,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}
