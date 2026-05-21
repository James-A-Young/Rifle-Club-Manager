import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Section21DeclarationForm from '../components/Section21DeclarationForm';
import { useAuth } from '../auth/AuthContext';

export default function Section21DeclarationSignUp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [formError, setFormError] = useState('');

  async function handleDeclarationSubmit(
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
      await refreshUser();

      const nextPath = searchParams.get('next')?.trim();
      const destination = nextPath && nextPath.startsWith('/') ? nextPath : '/';

      // On success, navigate to the dashboard after a short delay to show success message
      setTimeout(() => {
        navigate(destination, { replace: true });
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit declaration';
      setFormError(message);
      throw err;
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      padding: '40px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        maxWidth: '900px',
        width: '100%',
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
          color: 'white',
          padding: '40px',
          textAlign: 'center',
        }}>
          <h1 style={{
            margin: '0 0 15px 0',
            fontSize: '32px',
            fontWeight: '700',
            lineHeight: '1.2',
          }}>Section 21 Firearms Act 1968 Declaration</h1>
          <p style={{
            margin: '0',
            fontSize: '16px',
            opacity: 0.9,
            lineHeight: '1.5',
          }}>
            This is a mandatory legal declaration that must be completed before you can access firearms facilities.
          </p>
        </div>

        {formError && (
          <div style={{
            margin: '0',
            padding: '20px',
            backgroundColor: '#fee2e2',
            borderLeft: '4px solid #dc2626',
            borderRadius: '0',
          }}>
            <p style={{
              margin: '0',
              color: '#991b1b',
              fontSize: '14px',
            }}>{formError}</p>
          </div>
        )}

        <Section21DeclarationForm
          onSubmit={handleDeclarationSubmit}
        />

        <div style={{
          padding: '20px 40px',
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
        }}>
          <p style={{
            margin: '0',
            color: '#6b7280',
            fontSize: '13px',
            fontStyle: 'italic',
          }}>
            You will need to renew this declaration annually. Your renewal date will be one year from today.
          </p>
        </div>
      </div>
    </div>
  );
}
