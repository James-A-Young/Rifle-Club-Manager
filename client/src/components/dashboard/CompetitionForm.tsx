import React, { useState } from 'react';

interface RoundInput {
  dueDate: string;
}

export interface CompetitionFormData {
  seasonId: string;
  name: string;
  organiser: string;
  discipline: string;
  roundCount: number;
  cardsPerRound: number;
  rounds: RoundInput[];
}

interface Props {
  seasonId: string;
  clubId: string;
  disciplineOptions: string[];
  onSubmit: (data: CompetitionFormData) => Promise<void>;
  onCancel: () => void;
}

export default function CompetitionForm({ seasonId, clubId, disciplineOptions, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [organiser, setOrganiser] = useState('');
  const [discipline, setDiscipline] = useState(disciplineOptions[0] ?? '');
  const [roundCount, setRoundCount] = useState(6);
  const [cardsPerRound, setCardsPerRound] = useState(2);
  const [rounds, setRounds] = useState<RoundInput[]>(() =>
    Array.from({ length: 6 }, () => ({ dueDate: '' }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (disciplineOptions.length === 0) return;
    const exists = disciplineOptions.some(option => option.toLowerCase() === discipline.toLowerCase());
    if (!exists) {
      setDiscipline(disciplineOptions[0]);
    }
  }, [disciplineOptions, discipline]);

  function handleRoundCountChange(n: number) {
    const count = Math.max(1, Math.min(52, n));
    setRoundCount(count);
    setRounds(prev => {
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ dueDate: '' }))];
      }
      return prev.slice(0, count);
    });
  }

  function setRoundDueDate(index: number, value: string) {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, dueDate: value } : r));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!discipline.trim()) { setError('Discipline is required'); return; }
    if (rounds.some(r => !r.dueDate)) { setError('All rounds must have a due date'); return; }

    setSaving(true);
    try {
      await onSubmit({
        seasonId,
        name: name.trim(),
        organiser: organiser.trim(),
        discipline: discipline.trim(),
        roundCount,
        cardsPerRound,
        rounds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating competition');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Competition Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NSRA Short Metric" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Organiser</label>
          <input value={organiser} onChange={e => setOrganiser(e.target.value)} placeholder="e.g. NSRA" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Discipline *</label>
          {disciplineOptions.length > 0 ? (
            <select value={discipline} onChange={e => setDiscipline(e.target.value)}>
              {disciplineOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <div style={{ color: 'var(--gray-600)', fontSize: '0.9rem', padding: '0.5rem', border: '1px solid var(--gray-200)', borderRadius: '4px', background: 'var(--gray-50)' }}>
              No disciplines configured.
              {' '}
              <a href={`/clubs/${clubId}?tab=settings#disciplines-offered`} style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>
                Add disciplines in Club Settings
              </a>
            </div>
          )}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Number of Rounds</label>
          <input
            type="number"
            min={1}
            max={52}
            value={roundCount}
            onChange={e => handleRoundCountChange(Number(e.target.value))}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Cards per Round</label>
          <input
            type="number"
            min={1}
            max={20}
            value={cardsPerRound}
            onChange={e => setCardsPerRound(Math.max(1, Number(e.target.value)))}
          />
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Round Due Dates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {rounds.map((r, i) => (
            <div className="form-group" key={i} style={{ marginBottom: 0 }}>
              <label>Round {i + 1} Due Date</label>
              <input
                type="date"
                value={r.dueDate}
                onChange={e => setRoundDueDate(i, e.target.value)}
                required
              />
            </div>
          ))}
        </div>
      </div>

      <div className="actions" style={{ marginTop: '1rem' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || disciplineOptions.length === 0}>
          {saving ? 'Creating…' : 'Create Competition'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
