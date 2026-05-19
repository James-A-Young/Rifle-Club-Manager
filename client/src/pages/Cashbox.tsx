import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { CashBox, CashBoxTransaction } from '../types/club';

type ManualReason = 'ADD_FLOAT' | 'DONATION' | 'FEE_PAYMENT' | 'BANKED_CASH';
type Movement = 'ADD' | 'DEDUCT';

export default function Cashbox() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cashBox, setCashBox] = useState<CashBox | null>(null);
  const [transactions, setTransactions] = useState<CashBoxTransaction[]>([]);
  const [reason, setReason] = useState<ManualReason>('ADD_FLOAT');
  const [movement, setMovement] = useState<Movement>('ADD');
  const [amountPounds, setAmountPounds] = useState('0.00');
  const [note, setNote] = useState('');

  async function loadData() {
    if (!id) return;
    setLoading(true);
    setError('');

    try {
      const [cashBoxData, rows] = await Promise.all([
        api.get<CashBox>(`/api/cashbox/club/${id}`),
        api.get<CashBoxTransaction[]>(`/api/cashbox/club/${id}/transactions?pageSize=200`),
      ]);
      setCashBox(cashBoxData);
      setTransactions(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading cashbox');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    const amountPence = Math.round(Number(amountPounds || '0') * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      setError('Please enter a valid amount greater than zero');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await api.post(`/api/cashbox/club/${id}/transactions`, {
        reason,
        movement,
        amountPence,
        note: note.trim() || null,
      });
      setAmountPounds('0.00');
      setNote('');
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error recording transaction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cashbox</h1>
          <p style={{ color: 'var(--gray-600)' }}>Track cash balance and adjustments for this club.</p>
        </div>
        <div className="actions">
          <Link to={`/clubs/${id}`} className="btn btn-secondary btn-sm">Back to Club Dashboard</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          <section>
            <h2>Current Balance</h2>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>
              £{((cashBox?.balancePence ?? 0) / 100).toFixed(2)}
            </div>
            <div style={{ color: 'var(--gray-600)' }}>
              Last updated: {cashBox?.updatedAt ? new Date(cashBox.updatedAt).toLocaleString() : 'N/A'}
            </div>
          </section>

          <section>
            <h2>Manual Adjustment</h2>
            <form onSubmit={submitTransaction}>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Reason</label>
                  <select value={reason} onChange={e => setReason(e.target.value as ManualReason)}>
                    <option value="ADD_FLOAT">Add Float</option>
                    <option value="DONATION">Donation</option>
                    <option value="FEE_PAYMENT">Fee Payment</option>
                    <option value="BANKED_CASH">Banked Cash</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Direction</label>
                  <select value={movement} onChange={e => setMovement(e.target.value as Movement)}>
                    <option value="ADD">Add</option>
                    <option value="DEDUCT">Deduct</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Amount (£)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amountPounds}
                    onChange={e => setAmountPounds(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Note (optional)</label>
                  <input value={note} onChange={e => setNote(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Record Transaction'}
              </button>
            </form>
          </section>

          <section>
            <h2>Recent Transactions</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Created By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(row => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.reason}</td>
                    <td style={{ color: row.amountPence < 0 ? '#b91c1c' : '#166534' }}>
                      {row.amountPence < 0 ? '-' : '+'}£{(Math.abs(row.amountPence) / 100).toFixed(2)}
                    </td>
                    <td>£{(row.balanceAfterPence / 100).toFixed(2)}</td>
                    <td>{row.createdBy.name}</td>
                    <td>{row.note ?? ''}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                      No transactions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
