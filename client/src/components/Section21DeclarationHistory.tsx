import { useState, useEffect } from 'react';
import { api } from '../api';

interface Declaration {
  id: string;
  status: string;
  fullLegalName: string;
  signedDate: string;
  nextDueDate: string;
  createdAt: string;
}

interface Section21DeclarationHistoryProps {
  onViewClick?: (declarationId: string) => void;
}

export default function Section21DeclarationHistory({
  onViewClick,
}: Section21DeclarationHistoryProps) {
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchDeclarations();
  }, [offset]);

  async function fetchDeclarations() {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<{
        data: Declaration[];
        pagination: { limit: number; offset: number; total: number };
      }>(`/api/users/me/section21-declarations?limit=${limit}&offset=${offset}`);
      
      setDeclarations(response.data);
      setTotalCount(response.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load declaration history');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'SIGNED':
        return '#10b981'; // green
      case 'EXPIRED':
        return '#ef4444'; // red
      case 'PENDING_RENEWAL':
        return '#f59e0b'; // amber
      default:
        return '#6b7280'; // gray
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
        Loading declarations...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#991b1b',
          fontSize: '14px',
        }}
      >
        {error}
      </div>
    );
  }

  if (declarations.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
        No declarations found.
      </div>
    );
  }

  const hasMorePages = offset + limit < totalCount;
  const hasPreviousPages = offset > 0;

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                Signed Date
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                Signed By
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                Next Renewal
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#374151',
                }}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((decl, idx) => (
              <tr
                key={decl.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb',
                }}
              >
                <td style={{ padding: '12px' }}>{formatDate(decl.signedDate)}</td>
                <td style={{ padding: '12px' }}>{decl.fullLegalName}</td>
                <td style={{ padding: '12px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      backgroundColor: getStatusColor(decl.status) + '20',
                      color: getStatusColor(decl.status),
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                    }}
                  >
                    {decl.status}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>{formatDate(decl.nextDueDate)}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => onViewClick?.(decl.id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Showing {offset + 1} to {Math.min(offset + limit, totalCount)} of {totalCount}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={!hasPreviousPages}
            style={{
              padding: '6px 12px',
              backgroundColor: hasPreviousPages ? '#e5e7eb' : '#f3f4f6',
              color: hasPreviousPages ? '#1f2937' : '#9ca3af',
              border: 'none',
              borderRadius: '4px',
              cursor: hasPreviousPages ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: '500',
            }}
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasMorePages}
            style={{
              padding: '6px 12px',
              backgroundColor: hasMorePages ? '#e5e7eb' : '#f3f4f6',
              color: hasMorePages ? '#1f2937' : '#9ca3af',
              border: 'none',
              borderRadius: '4px',
              cursor: hasMorePages ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: '500',
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
