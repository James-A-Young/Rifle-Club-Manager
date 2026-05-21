import { useEffect, useState } from 'react';
import { api } from '../api';

interface Section21RenewalPromptProps {
  onDismiss?: () => void;
}

export default function Section21RenewalPrompt({ onDismiss }: Section21RenewalPromptProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await api.get<{ status: string }>('/api/users/me/section21-status');
        setStatus(response.status);
      } catch (err) {
        console.error('Failed to check Section 21 status:', err);
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, []);

  if (loading || dismissed || !status || status === 'SIGNED') {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  const isPending = status === 'PENDING_RENEWAL';
  const isExpired = status === 'EXPIRED';

  return (
    <div
      style={{
        margin: '1.5rem 0',
        padding: '16px 20px',
        backgroundColor: isPending ? '#fef3c7' : '#fee2e2',
        borderLeft: `4px solid ${isPending ? '#f59e0b' : '#dc2626'}`,
        borderRadius: '4px',
        color: isPending ? '#92400e' : '#991b1b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div>
        <strong style={{ fontSize: '15px' }}>
          {isExpired
            ? '⚠️ Your Section 21 declaration has expired'
            : '⚠️ Your Section 21 declaration is due for renewal'}
        </strong>
        <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
          {isExpired
            ? 'Please renew your declaration immediately to maintain access to firearms facilities.'
            : 'Your annual renewal is due. Please complete the renewal in your profile.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <a
          href="/profile"
          style={{
            padding: '8px 16px',
            backgroundColor: isPending ? '#f59e0b' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Renew Now
        </a>
        <button
          onClick={handleDismiss}
          style={{
            padding: '8px 12px',
            backgroundColor: 'transparent',
            color: isPending ? '#92400e' : '#991b1b',
            border: `1px solid ${isPending ? '#f59e0b' : '#dc2626'}`,
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
