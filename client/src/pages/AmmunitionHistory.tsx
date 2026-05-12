import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { AmmunitionType, AmmunitionSafe, AmmunitionSale, AmmunitionStockInput } from '../types/club';

interface Club {
  id: string;
  name: string;
}

interface InputsResponse {
  rows: AmmunitionStockInput[];
  nextCursor: string | null;
}

type ActiveTab = 'sales' | 'movements';

function toLocalDayBoundaryIso(date: string, boundary: 'start' | 'end'): string {
  const [yearRaw, monthRaw, dayRaw] = date.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return '';
  const localDate =
    boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  return localDate.toISOString();
}

export default function AmmunitionHistory() {
  const { id } = useParams<{ id: string }>();
  const [club, setClub] = useState<Club | null>(null);
  const [types, setTypes] = useState<AmmunitionType[]>([]);
  const [safes, setSafes] = useState<AmmunitionSafe[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('sales');
  const [error, setError] = useState('');

  // Sales state
  const [sales, setSales] = useState<AmmunitionSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesExporting, setSalesExporting] = useState(false);
  const [salesBuyerSearch, setSalesBuyerSearch] = useState('');
  const [salesSellerSearch, setSalesSellerSearch] = useState('');
  const [salesTypeId, setSalesTypeId] = useState('');
  const [salesFromDate, setSalesFromDate] = useState('');
  const [salesToDate, setSalesToDate] = useState('');

  // Movements state
  const [movements, setMovements] = useState<AmmunitionStockInput[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsNextCursor, setMovementsNextCursor] = useState<string | null>(null);
  const [movementsLoadingMore, setMovementsLoadingMore] = useState(false);
  const [movementsExporting, setMovementsExporting] = useState(false);
  const [movementsTypeId, setMovementsTypeId] = useState('');
  const [movementsSafeId, setMovementsSafeId] = useState('');
  const [movementsFromDate, setMovementsFromDate] = useState('');
  const [movementsToDate, setMovementsToDate] = useState('');

  const salesQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (salesBuyerSearch.trim()) params.set('buyerSearch', salesBuyerSearch.trim());
    if (salesSellerSearch.trim()) params.set('sellerSearch', salesSellerSearch.trim());
    if (salesTypeId) params.set('typeId', salesTypeId);
    if (salesFromDate) params.set('from', toLocalDayBoundaryIso(salesFromDate, 'start'));
    if (salesToDate) params.set('to', toLocalDayBoundaryIso(salesToDate, 'end'));
    return params;
  }, [salesBuyerSearch, salesSellerSearch, salesTypeId, salesFromDate, salesToDate]);

  const movementsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('pageSize', '25');
    if (movementsTypeId) params.set('typeId', movementsTypeId);
    if (movementsSafeId) params.set('safeId', movementsSafeId);
    if (movementsFromDate) params.set('from', toLocalDayBoundaryIso(movementsFromDate, 'start'));
    if (movementsToDate) params.set('to', toLocalDayBoundaryIso(movementsToDate, 'end'));
    return params;
  }, [movementsTypeId, movementsSafeId, movementsFromDate, movementsToDate]);

  useEffect(() => {
    if (!id) return;
    api.get<Club>(`/api/clubs/${id}`)
      .then(setClub)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load club'));
    api
      .get<{ types: AmmunitionType[]; safes: AmmunitionSafe[] }>(`/api/ammunition/club/${id}/settings`)
      .then(data => {
        setTypes(data.types);
        setSafes(data.safes);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load ammunition settings'));
  }, [id]);

  async function loadSales() {
    if (!id) return;
    setSalesLoading(true);
    setError('');
    try {
      const rows = await api.get<AmmunitionSale[]>(
        `/api/ammunition/club/${id}/sales?${salesQueryParams.toString()}`
      );
      setSales(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sales');
    } finally {
      setSalesLoading(false);
    }
  }

  async function loadMovements(reset = false) {
    if (!id) return;
    if (reset) {
      setMovementsLoading(true);
      setError('');
    } else {
      setMovementsLoadingMore(true);
    }
    try {
      const params = new URLSearchParams(movementsQueryParams);
      if (!reset && movementsNextCursor) {
        params.set('cursor', movementsNextCursor);
      }
      const data = await api.get<InputsResponse>(
        `/api/ammunition/club/${id}/stock/inputs?${params.toString()}`
      );
      setMovements(prev => (reset ? data.rows : [...prev, ...data.rows]));
      setMovementsNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load movements');
    } finally {
      setMovementsLoading(false);
      setMovementsLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!id || activeTab !== 'sales') return;
    void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesQueryParams, id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== 'movements') return;
    setMovementsNextCursor(null);
    void loadMovements(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementsQueryParams, id, activeTab]);

  async function exportSalesCsv() {
    if (!id) return;
    setSalesExporting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (salesBuyerSearch.trim()) params.set('buyerSearch', salesBuyerSearch.trim());
      if (salesSellerSearch.trim()) params.set('sellerSearch', salesSellerSearch.trim());
      if (salesTypeId) params.set('typeId', salesTypeId);
      if (salesFromDate) params.set('from', toLocalDayBoundaryIso(salesFromDate, 'start'));
      if (salesToDate) params.set('to', toLocalDayBoundaryIso(salesToDate, 'end'));
      const response = await fetch(`/api/ammunition/club/${id}/sales/export.csv?${params.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error?: string }).error ?? response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `club-${id}-ammunition-sales.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export sales CSV');
    } finally {
      setSalesExporting(false);
    }
  }

  async function exportMovementsCsv() {
    if (!id) return;
    setMovementsExporting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (movementsTypeId) params.set('typeId', movementsTypeId);
      if (movementsSafeId) params.set('safeId', movementsSafeId);
      if (movementsFromDate) params.set('from', toLocalDayBoundaryIso(movementsFromDate, 'start'));
      if (movementsToDate) params.set('to', toLocalDayBoundaryIso(movementsToDate, 'end'));
      const response = await fetch(
        `/api/ammunition/club/${id}/stock/inputs/export.csv?${params.toString()}`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((body as { error?: string }).error ?? response.statusText);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `club-${id}-stock-movements.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export movements CSV');
    } finally {
      setMovementsExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ammunition History</h1>
          <p style={{ color: 'var(--gray-600)', marginTop: '-0.5rem' }}>
            {club ? club.name : 'Loading club...'}
          </p>
        </div>
        <div className="actions">
          {id && (
            <Link to={`/clubs/${id}`} className="btn btn-secondary btn-sm">
              Back to Club
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          className={`btn ${activeTab === 'sales' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          type="button"
          onClick={() => setActiveTab('sales')}
        >
          Sales Ledger
        </button>
        <button
          className={`btn ${activeTab === 'movements' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          type="button"
          onClick={() => setActiveTab('movements')}
        >
          Stock Movements
        </button>
      </div>

      {activeTab === 'sales' && (
        <section>
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <h2>Sales Ledger</h2>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={exportSalesCsv}
              disabled={salesExporting}
            >
              {salesExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Buyer Search</label>
              <input
                value={salesBuyerSearch}
                onChange={e => setSalesBuyerSearch(e.target.value)}
                placeholder="Name or email"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Seller Search</label>
              <input
                value={salesSellerSearch}
                onChange={e => setSalesSellerSearch(e.target.value)}
                placeholder="Name or email"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Ammunition Type</label>
              <select value={salesTypeId} onChange={e => setSalesTypeId(e.target.value)}>
                <option value="">All types</option>
                {types.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From</label>
              <input type="date" value={salesFromDate} onChange={e => setSalesFromDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To</label>
              <input type="date" value={salesToDate} onChange={e => setSalesToDate(e.target.value)} />
            </div>
          </div>

          {salesLoading ? (
            <div>Loading...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Seller</th>
                  <th>Type</th>
                  <th>Safe</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id}>
                    <td>{new Date(sale.createdAt).toLocaleString()}</td>
                    <td>{sale.buyerFirstName} {sale.buyerLastName}</td>
                    <td>{sale.soldBy.name}</td>
                    <td>{sale.ammunitionType.name}</td>
                    <td>{sale.ammunitionSafe.name}</td>
                    <td>{sale.quantity}</td>
                    <td>£{(sale.unitPricePence / 100).toFixed(2)}</td>
                    <td>£{(sale.totalPricePence / 100).toFixed(2)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                      No sales found for selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activeTab === 'movements' && (
        <section>
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <h2>Stock Movements</h2>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={exportMovementsCsv}
              disabled={movementsExporting}
            >
              {movementsExporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Ammunition Type</label>
              <select value={movementsTypeId} onChange={e => setMovementsTypeId(e.target.value)}>
                <option value="">All types</option>
                {types.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Safe</label>
              <select value={movementsSafeId} onChange={e => setMovementsSafeId(e.target.value)}>
                <option value="">All safes</option>
                {safes.map(safe => (
                  <option key={safe.id} value={safe.id}>{safe.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From</label>
              <input type="date" value={movementsFromDate} onChange={e => setMovementsFromDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To</label>
              <input type="date" value={movementsToDate} onChange={e => setMovementsToDate(e.target.value)} />
            </div>
          </div>

          {movementsLoading ? (
            <div>Loading...</div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Safe</th>
                    <th>Quantity</th>
                    <th>Note</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(row => (
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.ammunitionType.name}</td>
                      <td>{row.ammunitionSafe.name}</td>
                      <td style={{ color: row.quantity < 0 ? 'var(--red-600, #dc2626)' : undefined }}>
                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                      </td>
                      <td>{row.note ?? ''}</td>
                      <td>{row.inputBy.name}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                        No movements found for selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {movementsNextCursor && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => loadMovements(false)}
                    disabled={movementsLoadingMore}
                  >
                    {movementsLoadingMore ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
