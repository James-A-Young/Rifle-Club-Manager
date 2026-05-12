import { Member, AmmunitionType, AmmunitionSafe, AmmunitionSale, AmmunitionStock, AmmunitionStockInput } from '../../types/club';

interface Props {
  members: Member[];
  types: AmmunitionType[];
  safes: AmmunitionSafe[];
  stock: AmmunitionStock[];
  sales: AmmunitionSale[];
  stockInputs: AmmunitionStockInput[];
  showStockInputs: boolean;
  saleBuyerUserId: string;
  saleBuyerFirstName: string;
  saleBuyerLastName: string;
  saleTypeId: string;
  saleSafeId: string;
  saleQuantity: number;
  saleTotalPence: number;
  ledgerBuyerSearch: string;
  ledgerSellerSearch: string;
  ledgerTypeId: string;
  ledgerFromDate: string;
  ledgerToDate: string;
  stockInputTypeId: string;
  stockInputSafeId: string;
  stockInputQuantity: number;
  onSaleBuyerUserIdChange: (value: string) => void;
  onSaleBuyerFirstNameChange: (value: string) => void;
  onSaleBuyerLastNameChange: (value: string) => void;
  onSaleTypeIdChange: (value: string) => void;
  onSaleSafeIdChange: (value: string) => void;
  onSaleQuantityChange: (value: number) => void;
  onConfirmSale: () => void;
  onLedgerBuyerSearchChange: (value: string) => void;
  onLedgerSellerSearchChange: (value: string) => void;
  onLedgerTypeIdChange: (value: string) => void;
  onLedgerFromDateChange: (value: string) => void;
  onLedgerToDateChange: (value: string) => void;
  onRefreshLedger: () => void;
  onExportLedgerCsv: () => void;
  onStockInputTypeIdChange: (value: string) => void;
  onStockInputSafeIdChange: (value: string) => void;
  onStockInputQuantityChange: (value: number) => void;
  onSubmitStockInput: () => void;
  onToggleStockInputs: () => void;
}

function getStockQuantity(stock: AmmunitionStock[], typeId: string, safeId: string): number {
  return stock.find(s => s.ammunitionTypeId === typeId && s.ammunitionSafeId === safeId)?.quantity ?? 0;
}

export default function AmmunitionSalesSection(props: Props) {
  const selectedType = props.types.find(t => t.id === props.saleTypeId);
  const selectedSafeStock = props.saleTypeId && props.saleSafeId
    ? getStockQuantity(props.stock, props.saleTypeId, props.saleSafeId)
    : 0;

  return (
    <>
      <section>
        <h2>Record Ammunition Sale</h2>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Member (optional)</label>
            <select value={props.saleBuyerUserId} onChange={e => props.onSaleBuyerUserIdChange(e.target.value)}>
              <option value="">Guest / Manual</option>
              {props.members.map(member => (
                <option key={member.userId} value={member.userId}>{member.user.name} ({member.user.email})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Buyer First Name</label>
            <input value={props.saleBuyerFirstName} onChange={e => props.onSaleBuyerFirstNameChange(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Buyer Last Name</label>
            <input value={props.saleBuyerLastName} onChange={e => props.onSaleBuyerLastNameChange(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Ammunition Type</label>
            <select value={props.saleTypeId} onChange={e => props.onSaleTypeIdChange(e.target.value)}>
              <option value="">Select type</option>
              {props.types.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From Safe</label>
            <select value={props.saleSafeId} onChange={e => props.onSaleSafeIdChange(e.target.value)}>
              <option value="">Select safe</option>
              {props.safes.map(safe => (
                <option key={safe.id} value={safe.id}>{safe.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Quantity</label>
            <input
              type="number"
              min={1}
              value={props.saleQuantity}
              onChange={e => props.onSaleQuantityChange(Number(e.target.value || '0'))}
            />
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--gray-700)' }}>
            Unit Price: {selectedType ? `£${(selectedType.currentPricePence / 100).toFixed(2)}` : 'N/A'} ·
            {' '}Available in selected safe: {selectedSafeStock} ·
            {' '}Total: <strong>£{(props.saleTotalPence / 100).toFixed(2)}</strong>
          </div>
          <button className="btn btn-primary" type="button" onClick={props.onConfirmSale}>
            Confirm Sale
          </button>
        </div>
      </section>

      <section>
        <div className="page-header">
          <h2>Ammunition Sales Ledger</h2>
          <button className="btn btn-secondary btn-sm" type="button" onClick={props.onExportLedgerCsv}>Download CSV</button>
        </div>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Buyer Search</label>
            <input value={props.ledgerBuyerSearch} onChange={e => props.onLedgerBuyerSearchChange(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Seller Search</label>
            <input value={props.ledgerSellerSearch} onChange={e => props.onLedgerSellerSearchChange(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select value={props.ledgerTypeId} onChange={e => props.onLedgerTypeIdChange(e.target.value)}>
              <option value="">All types</option>
              {props.types.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={props.ledgerFromDate} onChange={e => props.onLedgerFromDateChange(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={props.ledgerToDate} onChange={e => props.onLedgerToDateChange(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={props.onRefreshLedger}>Apply Filters</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Type</th>
              <th>Safe</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {props.sales.map(sale => (
              <tr key={sale.id}>
                <td>{new Date(sale.createdAt).toLocaleString()}</td>
                <td>{sale.buyerFirstName} {sale.buyerLastName}</td>
                <td>{sale.soldBy.name}</td>
                <td>{sale.ammunitionType.name}</td>
                <td>{sale.ammunitionSafe.name}</td>
                <td>{sale.quantity}</td>
                <td>£{(sale.totalPricePence / 100).toFixed(2)}</td>
              </tr>
            ))}
            {props.sales.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                  No sales found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <div className="page-header">
          <h2>Stock Management</h2>
          <button className="btn btn-secondary btn-sm" type="button" onClick={props.onToggleStockInputs}>
            {props.showStockInputs ? 'Hide Input History' : 'View Input History'}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Safe</th>
              {props.types.map(type => (
                <th key={type.id}>{type.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.safes.map(safe => (
              <tr key={safe.id}>
                <td>{safe.name}</td>
                {props.types.map(type => (
                  <td key={`${safe.id}-${type.id}`}>{getStockQuantity(props.stock, type.id, safe.id)}</td>
                ))}
              </tr>
            ))}
            {props.safes.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, props.types.length + 1)} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                  No safes configured
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginTop: '1rem' }}>Input Stock</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select value={props.stockInputTypeId} onChange={e => props.onStockInputTypeIdChange(e.target.value)}>
              <option value="">Select type</option>
              {props.types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Safe</label>
            <select value={props.stockInputSafeId} onChange={e => props.onStockInputSafeIdChange(e.target.value)}>
              <option value="">Select safe</option>
              {props.safes.map(safe => <option key={safe.id} value={safe.id}>{safe.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Quantity</label>
            <input
              type="number"
              min={1}
              value={props.stockInputQuantity}
              onChange={e => props.onStockInputQuantityChange(Number(e.target.value || '0'))}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={props.onSubmitStockInput}>Input Stock</button>
        </div>

        {props.showStockInputs && (
          <div style={{ marginTop: '1rem' }}>
            <h3>Stock Input History</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Safe</th>
                  <th>Quantity</th>
                  <th>Input By</th>
                </tr>
              </thead>
              <tbody>
                {props.stockInputs.map(row => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.ammunitionType.name}</td>
                    <td>{row.ammunitionSafe.name}</td>
                    <td>{row.quantity}</td>
                    <td>{row.inputBy.name}</td>
                  </tr>
                ))}
                {props.stockInputs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-600)' }}>
                      No stock input history
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
