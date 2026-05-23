import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';
import {
  CompetitionEventDetail,
  SuggestedDivision,
  SuggestedDivisionEntry,
} from '../types/club';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalEntry extends SuggestedDivisionEntry {
  _localId: string; // stable drag ID
}

interface LocalDivision {
  name: string;
  entries: LocalEntry[];
}

interface RoundRow {
  name: string;
  deadline: string;
}

// ---------------------------------------------------------------------------
// Sortable entry card
// ---------------------------------------------------------------------------

function EntryCard({ entry, divisionId }: { entry: LocalEntry; divisionId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry._localId,
    data: { divisionId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.55rem 0.75rem',
    background: entry.isBogey ? '#fef3c7' : '#fff',
    border: `1px solid ${entry.isBogey ? '#d97706' : 'var(--gray-400)'}`,
    borderRadius: 'var(--radius)',
    marginBottom: '0.4rem',
    cursor: 'grab',
    userSelect: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span style={{ color: 'var(--gray-600)', fontSize: '1rem' }}>⠿</span>
      <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>
        {entry.isBogey ? '🤖 Bogey' : entry.displayName}
      </span>
      <span style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
        avg {entry.declaredAverage.toFixed(1)}
      </span>
      {entry.isBogey && entry.bogeyScore != null && (
        <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
          bogey {entry.bogeyScore}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompetitionDivisionSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [event, setEvent] = useState<CompetitionEventDetail | null>(null);
  const [divisions, setDivisions] = useState<LocalDivision[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([{ name: 'Round 1', deadline: '' }]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Suggestion form state
  const [targetSize, setTargetSize] = useState(8);
  const [rawEntries, setRawEntries] = useState('');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDivId, setActiveDivId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Load competition event to get format/type context
  useEffect(() => {
    if (!id) return;
    api.get<CompetitionEventDetail>(`/api/competition-events/${id}`)
      .then(e => {
        setEvent(e);
        // Pre-populate from existing divisions if already finalized
        if (e.divisions.length > 0) {
          setDivisions(
            e.divisions.map(d => ({
              name: d.name,
              entries: d.participants.map((p, i) => ({
                _localId: `${d.id}-${i}`,
                displayName: p.displayName,
                declaredAverage: p.declaredAverage,
                clubId: p.clubId,
                userId: p.userId,
                isBogey: p.isBogey,
                bogeyScore: p.bogeyScore,
              })),
            })),
          );
          if (e.rounds.length > 0) {
            setRounds(e.rounds.map(r => ({
              name: r.name,
              deadline: r.deadline.slice(0, 10),
            })));
          }
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load competition'))
      .finally(() => setLoading(false));
  }, [id]);

  const getActiveEntry = useCallback((): LocalEntry | null => {
    if (!activeId) return null;
    for (const div of divisions) {
      const found = div.entries.find(e => e._localId === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, divisions]);

  // ---------------------------------------------------------------------------
  // Suggest divisions from backend
  // ---------------------------------------------------------------------------

  async function handleSuggest() {
    if (!event) return;
    const lines = rawEntries.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setError('Enter at least one participant entry.');
      return;
    }

    const entries = lines.map((line, i) => {
      const parts = line.split(',');
      const displayName = (parts[0] ?? '').trim() || `Entry ${i + 1}`;
      const declaredAverage = parseFloat(parts[1] ?? '0') || 0;
      return { displayName, declaredAverage };
    });

    setSuggesting(true);
    setError('');
    try {
      const suggested = await api.post<SuggestedDivision[]>('/api/competition-events/suggest-divisions', {
        format: event.format,
        targetDivisionSize: targetSize,
        entries,
      });

      let counter = 0;
      setDivisions(
        suggested.map(div => ({
          name: div.name,
          entries: div.entries.map(e => ({
            ...e,
            _localId: `local-${counter++}`,
          })),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest divisions');
    } finally {
      setSuggesting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // DnD handlers
  // ---------------------------------------------------------------------------

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setActiveDivId(String(e.active.data.current?.divisionId ?? ''));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeDiv = String(active.data.current?.divisionId ?? '');
    const overDiv = String(over.data.current?.divisionId ?? over.id);
    if (activeDiv === overDiv) return;

    setDivisions(prev => {
      const next = prev.map(d => ({ ...d, entries: [...d.entries] }));
      const sourceDivIdx = next.findIndex(d => d.name === activeDiv || d.entries.some(e => e._localId === String(active.id)));
      const destDivIdx = next.findIndex(d => d.name === overDiv || d.entries.some(e => e._localId === String(over.id)));
      if (sourceDivIdx === -1 || destDivIdx === -1 || sourceDivIdx === destDivIdx) return prev;

      const entryIdx = next[sourceDivIdx].entries.findIndex(e => e._localId === String(active.id));
      if (entryIdx === -1) return prev;
      const [moved] = next[sourceDivIdx].entries.splice(entryIdx, 1);
      moved._localId = moved._localId; // keep ID
      next[destDivIdx].entries.push({ ...moved, _localId: moved._localId });
      return next;
    });
    setActiveDivId(overDiv);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setActiveDivId(null);
    if (!over || active.id === over.id) return;

    setDivisions(prev => {
      const next = prev.map(d => ({ ...d, entries: [...d.entries] }));
      const divIdx = next.findIndex(d => d.entries.some(en => en._localId === String(active.id)));
      if (divIdx === -1) return prev;
      const entries = next[divIdx].entries;
      const oldIdx = entries.findIndex(e => e._localId === String(active.id));
      const newIdx = entries.findIndex(e => e._localId === String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      next[divIdx].entries = arrayMove(entries, oldIdx, newIdx);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------------

  async function handleFinalize() {
    if (!id || !event) return;
    if (divisions.length === 0) {
      setError('Add at least one division.');
      return;
    }
    const invalidRound = rounds.find(r => !r.name.trim() || !r.deadline);
    if (invalidRound) {
      setError('All rounds need a name and deadline date.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.post(`/api/competition-events/${id}/finalize`, {
        format: event.format,
        type: event.type,
        divisions: divisions.map(d => ({
          name: d.name,
          participants: d.entries.map(e => ({
            displayName: e.displayName,
            declaredAverage: e.declaredAverage,
            clubId: e.clubId ?? null,
            userId: e.userId ?? null,
            isBogey: e.isBogey ?? false,
            bogeyScore: e.bogeyScore ?? null,
          })),
        })),
        rounds: rounds.map(r => ({
          name: r.name,
          deadline: `${r.deadline}T00:00:00.000Z`,
        })),
      });
      navigate(`/competitions/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize divisions');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Rounds management
  // ---------------------------------------------------------------------------

  function addRound() {
    setRounds(prev => [...prev, { name: `Round ${prev.length + 1}`, deadline: '' }]);
  }

  function removeRound(idx: number) {
    setRounds(prev => prev.filter((_, i) => i !== idx));
  }

  function updateRound(idx: number, field: keyof RoundRow, value: string) {
    setRounds(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => navigate(-1)} style={ghostBtnStyle}>← Back</button>
        <h1 style={{ color: 'var(--navy)', margin: 0 }}>Division Setup</h1>
        {event && (
          <span style={{ background: 'var(--gray-200)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius)', fontSize: '0.82rem', fontWeight: 600 }}>
            {event.format} · {event.type}
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: '#fee', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Entry input */}
      <section style={cardStyle}>
        <h2 style={sectionHeadStyle}>1. Add Participants</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '0.75rem' }}>
          One per line: <code>Display Name, DeclaredAverage</code>  e.g. <code>Alice Smith, 94.5</code>
        </p>
        <textarea
          value={rawEntries}
          onChange={e => setRawEntries(e.target.value)}
          rows={6}
          placeholder={'Alice Smith, 94.5\nBob Jones, 91.0\nTeam A, 87.3'}
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical', width: '100%' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            Division size:
            <input
              type="number"
              value={targetSize}
              min={2}
              max={32}
              onChange={e => setTargetSize(Number(e.target.value))}
              style={{ ...inputStyle, width: 80, marginLeft: '0.5rem', display: 'inline-block' }}
            />
          </label>
          <button onClick={handleSuggest} disabled={suggesting} style={primaryBtnStyle}>
            {suggesting ? 'Calculating…' : '✨ Suggest Divisions'}
          </button>
        </div>
      </section>

      {/* Drag-and-drop division editor */}
      {divisions.length > 0 && (
        <section style={cardStyle}>
          <h2 style={sectionHeadStyle}>2. Adjust Divisions</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>
            Drag entries between divisions to adjust placement. Rename divisions using the text field.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
              {divisions.map((div, divIdx) => (
                <div key={divIdx} style={{ border: '1px solid var(--gray-400)', borderRadius: 'var(--radius)', padding: '0.75rem', background: 'var(--gray-50)' }}>
                  <input
                    value={div.name}
                    onChange={e => setDivisions(prev => prev.map((d, i) => i === divIdx ? { ...d, name: e.target.value } : d))}
                    style={{ ...inputStyle, fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.95rem' }}
                  />
                  <SortableContext
                    items={div.entries.map(e => e._localId)}
                    strategy={verticalListSortingStrategy}
                  >
                    {div.entries.map(entry => (
                      <EntryCard key={entry._localId} entry={entry} divisionId={div.name} />
                    ))}
                  </SortableContext>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '0.4rem' }}>
                    {div.entries.length} {div.entries.length === 1 ? 'entry' : 'entries'}
                    {event?.format === 'LEAGUE' && div.entries.length % 2 !== 0 && (
                      <span style={{ color: 'var(--warning)', marginLeft: '0.5rem' }}>⚠ odd — needs bogey</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DragOverlay>
              {activeId && activeDivId ? (
                <div style={{
                  padding: '0.55rem 0.75rem',
                  background: 'var(--navy)',
                  color: '#fff',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  cursor: 'grabbing',
                }}>
                  {getActiveEntry()?.displayName ?? ''}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      )}

      {/* Rounds */}
      {divisions.length > 0 && (
        <section style={cardStyle}>
          <h2 style={sectionHeadStyle}>3. Competition Rounds</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {rounds.map((round, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={round.name}
                  onChange={e => updateRound(idx, 'name', e.target.value)}
                  placeholder="Round name"
                  style={{ ...inputStyle, flex: '1 1 160px' }}
                />
                <input
                  type="date"
                  value={round.deadline}
                  onChange={e => updateRound(idx, 'deadline', e.target.value)}
                  style={{ ...inputStyle, flex: '1 1 160px' }}
                />
                {rounds.length > 1 && (
                  <button onClick={() => removeRound(idx)} style={{ ...ghostBtnStyle, color: 'var(--danger)' }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addRound} style={{ ...ghostBtnStyle, marginTop: '0.5rem' }}>+ Add Round</button>
        </section>
      )}

      {/* Finalize */}
      {divisions.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button onClick={() => navigate(-1)} style={{ ...primaryBtnStyle, background: 'var(--gray-200)', color: 'var(--gray-800)' }}>
            Cancel
          </button>
          <button onClick={handleFinalize} disabled={saving} style={primaryBtnStyle}>
            {saving ? 'Saving…' : '✅ Finalise Divisions & Matches'}
          </button>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--gray-200)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  marginBottom: '1.25rem',
  boxShadow: 'var(--shadow)',
};

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  color: 'var(--navy)',
  marginBottom: '0.75rem',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--gray-400)',
  borderRadius: 'var(--radius)',
  fontSize: '0.9rem',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.65rem 1.25rem',
  background: 'var(--navy)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.9rem',
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
