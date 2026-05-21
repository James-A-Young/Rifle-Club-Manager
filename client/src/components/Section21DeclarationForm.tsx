import React, { useState } from 'react';
import '../styles/global.css';

interface Section21DeclarationFormProps {
  onSubmit: (
    fullLegalName: string,
    confirmations: {
      section1: boolean;
      section1_2: boolean;
      section1_3: boolean;
      section2: boolean;
      section3: boolean;
    },
  ) => Promise<void>;
  onCancel?: () => void;
}

export default function Section21DeclarationForm({
  onSubmit,
  onCancel,
}: Section21DeclarationFormProps) {
  const [fullLegalName, setFullLegalName] = useState('');
  const [checkboxes, setCheckboxes] = useState({
    section1: false,
    section1_2: false,
    section1_3: false,
    section2: false,
    section3: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const allCheckboxesChecked =
    checkboxes.section1 &&
    checkboxes.section1_2 &&
    checkboxes.section1_3 &&
    checkboxes.section2 &&
    checkboxes.section3;

  const isFormValid = allCheckboxesChecked && fullLegalName.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!isFormValid) {
      setError('Please check all declarations and enter your full legal name');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onSubmit(fullLegalName, checkboxes);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit declaration');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '6px', color: '#065f46' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#047857' }}>Declaration Submitted Successfully</h3>
        <p style={{ margin: '8px 0' }}>Your Section 21 Firearms Act 1968 declaration has been accepted.</p>
        <p style={{ margin: '8px 0' }}>Your next renewal will be due on {new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      {error && <div style={{ padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b' }}>{error}</div>}

      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>Section 1: Section 21 Firearms Act 1968 Declaration</h3>
        <p style={{ margin: '0 0 15px 0', color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>
          It is an offence for a person who is prohibited by Section 21 of the Firearms Act 1968 to have a firearm or ammunition in his or her possession. By checking the boxes below, you are making a legally binding declaration regarding your eligibility to handle firearms.
        </p>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', gap: '12px', cursor: 'pointer', lineHeight: '1.5', color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={checkboxes.section1}
              onChange={e => setCheckboxes(c => ({ ...c, section1: e.target.checked }))}
              required
              style={{ flexShrink: 0, width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>I declare that I am not a person prohibited from possessing a firearm or ammunition under Section 21 of the Firearms Act 1968.</span>
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', gap: '12px', cursor: 'pointer', lineHeight: '1.5', color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={checkboxes.section1_2}
              onChange={e => setCheckboxes(c => ({ ...c, section1_2: e.target.checked }))}
              required
              style={{ flexShrink: 0, width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>I declare that I have never been sentenced to a term of imprisonment, youth custody, or corrective training of three years or more (which carries a lifetime prohibition).</span>
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', gap: '12px', cursor: 'pointer', lineHeight: '1.5', color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={checkboxes.section1_3}
              onChange={e => setCheckboxes(c => ({ ...c, section1_3: e.target.checked }))}
              required
              style={{ flexShrink: 0, width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>I declare that I have not, within the last five years, been sentenced to a term of imprisonment, youth custody, or corrective training of three months or more but less than three years, nor have I received a suspended sentence of three months or more within the last five years.</span>
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>Section 2: Certificate History & Applications</h3>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', gap: '12px', cursor: 'pointer', lineHeight: '1.5', color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={checkboxes.section2}
              onChange={e => setCheckboxes(c => ({ ...c, section2: e.target.checked }))}
              required
              style={{ flexShrink: 0, width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>I declare that I have never had an application for a Firearm Certificate (FAC) or Shotgun Certificate (SGC) refused, nor have I ever had an FAC or SGC revoked.</span>
          </label>
        </div>
        <p style={{ margin: '10px 0 0 0', padding: '10px', backgroundColor: '#fef3c7', borderLeft: '4px solid #f59e0b', color: '#92400e', fontSize: '14px' }}>
          <strong>Note:</strong> If you cannot tick this box, please stop and contact the Club Secretary directly to discuss your circumstances.
        </p>
      </div>

      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>Section 3: Police Data Sharing Consent</h3>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', gap: '12px', cursor: 'pointer', lineHeight: '1.5', color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={checkboxes.section3}
              onChange={e => setCheckboxes(c => ({ ...c, section3: e.target.checked }))}
              required
              style={{ flexShrink: 0, width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer' }}
            />
            <span>I understand and agree that the Club is required by Home Office regulations to submit my full details (including Name, Date of Birth, and Address) to the relevant Police Firearms Licensing Department for background vetting prior to me being permitted to handle any firearms or ammunition. I consent to this data being shared for this purpose.</span>
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '30px', paddingBottom: '20px' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>Section 4: Final Digital Signature</h3>
        <p style={{ margin: '0 0 15px 0', color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>
          By typing my name below and clicking "Submit", I confirm that all information provided in this declaration is true, accurate, and complete to the best of my knowledge. I understand that providing false information on this form is a serious criminal offence.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="fullLegalName" style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>Full Legal Name</label>
          <input
            id="fullLegalName"
            type="text"
            value={fullLegalName}
            onChange={e => setFullLegalName(e.target.value)}
            placeholder="Enter your full legal name"
            required
            maxLength={255}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>Date</label>
          <div style={{ width: '100%', padding: '10px 12px', backgroundColor: '#f9fafb', border: '1px solid #d1d5db', borderRadius: '6px', color: '#6b7280', cursor: 'default' }}>
            {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '30px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: '500',
            cursor: isFormValid && !loading ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            backgroundColor: isFormValid && !loading ? '#3b82f6' : '#d1d5db',
            color: isFormValid && !loading ? 'white' : '#9ca3af',
            transition: 'all 0.2s',
          }}
          disabled={!isFormValid || loading}
        >
          {loading ? 'Submitting…' : 'Submit Declaration'}
        </button>
        {onCancel && (
          <button
            type="button"
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              backgroundColor: loading ? '#f3f4f6' : '#e5e7eb',
              color: loading ? '#9ca3af' : '#1f2937',
              transition: 'all 0.2s',
            }}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
