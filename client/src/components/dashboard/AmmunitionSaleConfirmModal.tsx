import { PaymentMethod } from '../../types/club';

interface Props {
  open: boolean;
  buyerFirstName: string;
  buyerLastName: string;
  ammunitionType: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  error: string;
  submitting: boolean;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onClose: () => void;
  onConfirmCash: () => void;
  onConfirmOnline: () => void;
}

function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Bank Transfer';
    default:
      return `${method.charAt(0)}${method.slice(1).toLowerCase()}`;
  }
}

export default function AmmunitionSaleConfirmModal(props: Props) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="policy-modal-backdrop" onClick={props.onClose}>
      <div
        className="policy-modal"
        style={{ width: 'min(640px, 100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm ammunition sale"
        onClick={e => e.stopPropagation()}
      >
        <div className="policy-modal-header">
          <h2>Confirm Ammunition Sale</h2>
          <button className="btn btn-secondary" type="button" onClick={props.onClose} disabled={props.submitting}>
            Close
          </button>
        </div>
        <div className="policy-modal-content">
          <p style={{ marginTop: 0, marginBottom: '1rem' }}>
            Check these details carefully before recording this sale.
          </p>
          {props.error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{props.error}</div>}
          <div
            style={{
              border: '1px solid var(--gray-300)',
              borderRadius: '8px',
              padding: '1rem',
              background: 'var(--gray-100)',
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <div><strong>Buyer:</strong> {props.buyerFirstName} {props.buyerLastName}</div>
            <div><strong>Type:</strong> {props.ammunitionType || 'N/A'}</div>
            <div><strong>Quantity:</strong> {props.quantity}</div>
            <div><strong>Payment Type:</strong> {formatPaymentMethodLabel(props.paymentMethod)}</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontWeight: 600 }}>Adjust Payment Type</label>
              <select
                value={props.paymentMethod}
                onChange={e => props.onPaymentMethodChange(e.target.value as PaymentMethod)}
                disabled={props.submitting}
              >
                <option value="CASH">Cash</option>
                <option value="ONLINE">Online</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <p style={{ marginTop: '1rem', marginBottom: 0, color: 'var(--gray-700)' }}>
            Choose <strong>Cash</strong> only when payment type is Cash. Choose <strong>Online</strong> for every non-cash payment type.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="button" onClick={props.onClose} disabled={props.submitting}>
              Back
            </button>
            <button className="btn btn-warning" type="button" onClick={props.onConfirmCash} disabled={props.submitting}>
              {props.submitting ? 'Saving...' : 'Cash'}
            </button>
            <button className="btn btn-primary" type="button" onClick={props.onConfirmOnline} disabled={props.submitting}>
              {props.submitting ? 'Saving...' : 'Online'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
