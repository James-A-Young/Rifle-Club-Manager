interface Section21DeclarationViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  declaration?: {
    id: string;
    status: string;
    fullLegalName: string;
    signedDate: string;
    signedTimestamp: string;
    maskedIpAddress?: string;
    userAgent: string;
    declarationText: string;
    nextDueDate: string;
  } | null;
  isAdminView?: boolean;
}

export default function Section21DeclarationViewModal({
  isOpen,
  onClose,
  declaration,
  isAdminView = false,
}: Section21DeclarationViewModalProps) {
  if (!isOpen || !declaration) {
    return null;
  }

  function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '30px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '600', color: '#1f2937' }}>
            Section 21 Declaration
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            backgroundColor: '#f9fafb',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: '#374151' }}>Status:</strong>
            <span
              style={{
                marginLeft: '8px',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor:
                  declaration.status === 'SIGNED' ? '#d1fae5' : declaration.status === 'EXPIRED' ? '#fee2e2' : '#fef3c7',
                color:
                  declaration.status === 'SIGNED' ? '#047857' : declaration.status === 'EXPIRED' ? '#991b1b' : '#92400e',
                fontWeight: '600',
              }}
            >
              {declaration.status}
            </span>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: '#374151' }}>Signed By:</strong>
            <span style={{ marginLeft: '8px', color: '#6b7280' }}>{declaration.fullLegalName}</span>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: '#374151' }}>Signed Date:</strong>
            <span style={{ marginLeft: '8px', color: '#6b7280' }}>{formatDateTime(declaration.signedDate)}</span>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: '#374151' }}>Next Renewal Due:</strong>
            <span style={{ marginLeft: '8px', color: '#6b7280' }}>
              {new Date(declaration.nextDueDate).toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          {isAdminView && declaration.maskedIpAddress && (
            <>
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#374151' }}>IP Address:</strong>
                <span style={{ marginLeft: '8px', color: '#6b7280', fontFamily: 'monospace' }}>
                  {declaration.maskedIpAddress}
                </span>
              </div>
              <div>
                <strong style={{ color: '#374151' }}>Device Info:</strong>
                <span
                  style={{
                    marginLeft: '8px',
                    color: '#6b7280',
                    fontSize: '12px',
                    wordBreak: 'break-word',
                    maxWidth: '400px',
                    display: 'inline-block',
                  }}
                >
                  {declaration.userAgent}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
            Declaration Text
          </h3>
          <div
            style={{
              backgroundColor: '#f9fafb',
              padding: '15px',
              borderRadius: '6px',
              fontSize: '13px',
              lineHeight: '1.6',
              color: '#374151',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxHeight: '300px',
              overflow: 'auto',
              border: '1px solid #e5e7eb',
            }}
          >
            {declaration.declarationText}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#e5e7eb',
              color: '#1f2937',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '14px',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
