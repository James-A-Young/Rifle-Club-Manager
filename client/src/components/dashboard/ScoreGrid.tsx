import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { ScoreSheet } from '../../types/club';

interface Props {
  clubId: string;
  sheet: ScoreSheet;
  onScoreUpdated: (scoreId: string, value: number | null) => void;
}

type CellStatus = 'idle' | 'saving' | 'saved' | 'error';

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

function isValidScoreValue(value: number): boolean {
  return Number.isFinite(value)
    && value >= 0
    && value <= 10000
    && hasAtMostTwoDecimalPlaces(value);
}

export default function ScoreGrid({ clubId, sheet, onScoreUpdated }: Props) {
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
  // Local display values so the input stays responsive while saving
  const [localValues, setLocalValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const round of sheet.rounds) {
      for (const score of round.scores) {
        init[score.id] = score.score !== null ? String(score.score) : '';
      }
    }
    return init;
  });

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const statusTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Clear all pending debounce timers
      Object.values(debounceTimers.current).forEach(clearTimeout);
      // Clear all pending status-reset timers
      Object.values(statusTimers.current).forEach(clearTimeout);
      // Abort all in-flight save requests
      Object.values(abortControllers.current).forEach(ctrl => ctrl.abort());
    };
  }, []);

  const save = useCallback(async (scoreId: string, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);

    if (trimmed !== '' && (value === null || !isValidScoreValue(value))) {
      setCellStatus(prev => ({ ...prev, [scoreId]: 'error' }));
      return;
    }

    // Abort any previous in-flight request for this cell
    abortControllers.current[scoreId]?.abort();
    const controller = new AbortController();
    abortControllers.current[scoreId] = controller;

    setCellStatus(prev => ({ ...prev, [scoreId]: 'saving' }));
    try {
      await api.patch(`/api/clubs/${clubId}/scoring/scores/${scoreId}`, { score: value }, controller.signal);
      if (!mountedRef.current) return;
      setCellStatus(prev => ({ ...prev, [scoreId]: 'saved' }));
      onScoreUpdated(scoreId, value);
      const t = setTimeout(() => {
        if (!mountedRef.current) return;
        setCellStatus(prev => {
          if (prev[scoreId] === 'saved') return { ...prev, [scoreId]: 'idle' };
          return prev;
        });
      }, 1500);
      statusTimers.current[scoreId] = t;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // request cancelled — ignore
      if (!mountedRef.current) return;
      setCellStatus(prev => ({ ...prev, [scoreId]: 'error' }));
    }
  }, [clubId, onScoreUpdated]);

  function handleChange(scoreId: string, raw: string) {
    setLocalValues(prev => ({ ...prev, [scoreId]: raw }));
    clearTimeout(debounceTimers.current[scoreId]);
    debounceTimers.current[scoreId] = setTimeout(() => save(scoreId, raw), 600);
  }

  function handleBlur(scoreId: string, raw: string) {
    clearTimeout(debounceTimers.current[scoreId]);
    save(scoreId, raw);
  }

  function cellBorder(scoreId: string): string {
    const status = cellStatus[scoreId];
    if (status === 'saving') return '1px solid var(--warning)';
    if (status === 'saved') return '1px solid var(--success)';
    if (status === 'error') return '1px solid var(--danger)';
    return '1px solid var(--gray-400)';
  }

  const { competition, members, rounds } = sheet;

  // Build column header: Round 1 C1, Round 1 C2 … Round N Cx
  const columns: { roundId: string; roundNumber: number; dueDate: string; cardNumber: number }[] = [];
  for (const r of rounds) {
    for (let c = 1; c <= competition.cardsPerRound; c++) {
      columns.push({ roundId: r.id, roundNumber: r.roundNumber, dueDate: r.dueDate, cardNumber: c });
    }
  }

  // Build lookup: roundId+userId+cardNumber → score cell
  const scoreLookup = new Map<string, { id: string; score: number | null }>();
  for (const r of rounds) {
    for (const s of r.scores) {
      scoreLookup.set(`${r.id}|${s.userId}|${s.cardNumber}`, { id: s.id, score: s.score });
    }
  }

  // Per-member row totals
  function memberRowTotal(memberId: string): number {
    let total = 0;
    for (const col of columns) {
      const cell = scoreLookup.get(`${col.roundId}|${memberId}|${col.cardNumber}`);
      if (cell) {
        const v = localValues[cell.id];
        const n = v !== undefined && v.trim() !== '' ? Number(v) : null;
        if (n !== null && isValidScoreValue(n)) total += n;
      }
    }
    return total;
  }

  // Per-member card count (non-null)
  function memberCardCount(memberId: string): number {
    let count = 0;
    for (const col of columns) {
      const cell = scoreLookup.get(`${col.roundId}|${memberId}|${col.cardNumber}`);
      if (cell) {
        const v = localValues[cell.id];
        if (v !== undefined && v.trim() !== '') count++;
      }
    }
    return count;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Group columns by round for sub-headers
  const roundGroups: { roundNumber: number; dueDate: string; startIndex: number; count: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const last = roundGroups[roundGroups.length - 1];
    if (!last || last.roundNumber !== col.roundNumber) {
      roundGroups.push({ roundNumber: col.roundNumber, dueDate: col.dueDate, startIndex: i, count: 1 });
    } else {
      last.count++;
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '0.35rem 0.4rem',
    background: 'var(--gray-100)',
    border: '1px solid var(--gray-200)',
    fontSize: '0.75rem',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.25rem 0.3rem',
    border: '1px solid var(--gray-200)',
    textAlign: 'center',
  };

  return (
    <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
        <thead>
          {/* Round sub-header row */}
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', minWidth: 140 }}>Member</th>
            {roundGroups.map(rg => {
              const due = new Date(rg.dueDate);
              const isOverdue = due < now && due >= sevenDaysAgo;
              const isPast = due < sevenDaysAgo;
              return (
                <th
                  key={rg.roundNumber}
                  colSpan={rg.count}
                  style={{
                    ...thStyle,
                    background: isOverdue ? '#fdecea' : isPast ? 'var(--gray-200)' : 'var(--gray-100)',
                    color: isOverdue ? '#c0392b' : 'inherit',
                  }}
                >
                  Round {rg.roundNumber}
                  <br />
                  <span style={{ fontWeight: 400, fontSize: '0.7rem' }}>
                    Due {due.toLocaleDateString()}
                  </span>
                </th>
              );
            })}
            <th style={{ ...thStyle, minWidth: 60 }}>Total</th>
            <th style={{ ...thStyle, minWidth: 50 }}>Avg</th>
          </tr>
          {/* Card number sub-row */}
          <tr>
            <th style={{ ...thStyle, textAlign: 'left' }}></th>
            {columns.map((col, i) => (
              <th key={i} style={thStyle}>C{col.cardNumber}</th>
            ))}
            <th style={thStyle}></th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {members.map(member => {
            const total = memberRowTotal(member.id);
            const cardCount = memberCardCount(member.id);
            const avg = cardCount > 0 ? (total / cardCount).toFixed(1) : '—';

            return (
              <tr key={member.id}>
                <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>{member.name}</td>
                {columns.map((col, i) => {
                  const cell = scoreLookup.get(`${col.roundId}|${member.id}|${col.cardNumber}`);
                  if (!cell) {
                    return <td key={i} style={tdStyle}>—</td>;
                  }
                  const status = cellStatus[cell.id] ?? 'idle';
                  return (
                    <td key={i} style={tdStyle}>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        step="0.01"
                        value={localValues[cell.id] ?? ''}
                        onChange={e => handleChange(cell.id, e.target.value)}
                        onBlur={e => handleBlur(cell.id, e.target.value)}
                        aria-label={`Score for ${member.name} round ${col.roundNumber} card ${col.cardNumber}`}
                        aria-invalid={cellStatus[cell.id] === 'error'}
                        style={{
                          width: 52,
                          padding: '0.2rem 0.3rem',
                          border: cellBorder(cell.id),
                          borderRadius: 3,
                          textAlign: 'center',
                          fontSize: '0.85rem',
                          background: status === 'error' ? '#fdecea' : 'white',
                          transition: 'border-color 0.2s',
                        }}
                        placeholder="—"
                        title={status === 'error' ? 'Save failed — try again' : undefined}
                      />
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontWeight: 600 }}>{cardCount > 0 ? total : '—'}</td>
                <td style={tdStyle}>{avg}</td>
              </tr>
            );
          })}
          {members.length === 0 && (
            <tr>
              <td colSpan={columns.length + 3} style={{ ...tdStyle, color: 'var(--gray-600)', padding: '1rem' }}>
                No members enrolled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
