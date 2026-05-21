import { useState } from 'react';
import Section21DeclarationForm from './Section21DeclarationForm';
import { api } from '../api';

interface Section21DeclarationRenewalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function Section21DeclarationRenewal({
  isOpen,
  onClose,
  onSuccess,
}: Section21DeclarationRenewalProps) {
  const [formError, setFormError] = useState('');

  async function handleRenewal(
    fullLegalName: string,
    confirmations: {
      section1: boolean;
      section1_2: boolean;
      section1_3: boolean;
      section2: boolean;
      section3: boolean;
    },
  ): Promise<void> {
    try {
      setFormError('');
      await api.post('/api/users/me/section21-declaration', {
        fullLegalName,
        confirmations,
      });
      // Wait for success message to display in form
      setTimeout(() => {
        onSuccess?.();
        setTimeout(() => {
          onClose();
        }, 1000);
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit renewal';
      setFormError(message);
      throw err;
    }
  }

  if (!isOpen) {
    return null;
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
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: 'white',
            padding: '25px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
              Annual Renewal Required
            </h2>
            <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
              Your Section 21 declaration is due for renewal. Please complete the declaration below.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: 'white',
              opacity: 0.8,
            }}
          >
            ×
          </button>
        </div>

        {formError && (
          <div
            style={{
              margin: '0',
              padding: '20px',
              backgroundColor: '#fee2e2',
              borderLeft: '4px solid #dc2626',
              borderRadius: '0',
            }}
          >
            <p
              style={{
                margin: '0',
                color: '#991b1b',
                fontSize: '14px',
              }}
            >
              {formError}
            </p>
          </div>
        )}

        <Section21DeclarationForm onSubmit={handleRenewal} onCancel={onClose} />
      </div>
    </div>
  );
}
