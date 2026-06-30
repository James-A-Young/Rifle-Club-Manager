import React, { useState } from 'react';
import { VISIT_PURPOSES, GuestDetails, EMPTY_GUEST_DETAILS } from '../shared/signIn';
import { formatFirearmOptionLabel } from '../shared/firearms';
import { SimpleFirearm } from '../types/club';

const SECTION21_DECLARATION_TEXT = `SECTION 1: SECTION 21 FIREARMS ACT 1968 DECLARATION

Important Legal Declaration Under Section 21 of the Firearms Act 1968

It is an offence for a person who is prohibited by Section 21 of the Firearms Act 1968 to have a firearm or ammunition in his or her possession. By pressing sign in, you are making a legally binding declaration regarding your eligibility to handle firearms.

I declare that I am not a person prohibited from possessing a firearm or ammunition under Section 21 of the Firearms Act 1968.

I declare that I have never been sentenced to a term of imprisonment, youth custody, or corrective training of three years or more (which carries a lifetime prohibition).

I declare that I have not, within the last five years, been sentenced to a term of imprisonment, youth custody, or corrective training of three months or more but less than three years, nor have I received a suspended sentence of three months or more within the last five years.

SECTION 2: CERTIFICATE HISTORY & APPLICATIONS

I declare that I have never had an application for a Firearm Certificate (FAC) or Shotgun Certificate (SGC) refused, nor have I ever had an FAC or SGC revoked.

SECTION 3: POLICE DATA SHARING CONSENT

I understand and agree that the Club is required by Home Office regulations to submit my full details (including Name, Date of Birth, and Address) to the relevant Police Firearms Licensing Department for background vetting. I consent to this data being shared for this purpose.

SECTION 4: FINAL DIGITAL SIGNATURE

Applicant Confirmation

By entering your details and submitting this form, you confirm that all information provided is true, accurate, and complete to the best of your knowledge. You understand that providing false information is a serious criminal offence.`;

export interface VisitFormPayload {
  purpose: string;
  firearmUsedId?: string;
  firearmSerialNumber?: string;
  guestDetails?: GuestDetails;
}

interface Props {
  clubFirearms: SimpleFirearm[];
  myFirearms?: SimpleFirearm[];
  /** When true, guest-detail fields are hidden (authenticated user is signing in). */
  isAuthenticated: boolean;
  /** Called with the built payload. Should throw on API error so the form can stay populated. */
  onSubmit: (payload: VisitFormPayload) => Promise<void>;
  submitLabel?: string;
}

export default function VisitSignInForm({
  clubFirearms,
  myFirearms = [],
  isAuthenticated,
  onSubmit,
  submitLabel = 'Sign In',
}: Props) {
  const [purpose, setPurpose] = useState('Practice');
  const [firearmUsedId, setFirearmUsedId] = useState('');
  const [firearmSerialNumber, setFirearmSerialNumber] = useState('');
  const [guestDetails, setGuestDetails] = useState<GuestDetails>(EMPTY_GUEST_DETAILS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullDeclaration, setShowFullDeclaration] = useState(false);

  const myFavoriteFirearms = myFirearms.filter(f => Boolean(f.isFavorite));
  const clubFavoriteFirearms = clubFirearms.filter(f => Boolean(f.isFavorite));
  const myArmoryFirearms = myFirearms.filter(f => !Boolean(f.isFavorite));
  const clubArmoryFirearms = clubFirearms.filter(f => !Boolean(f.isFavorite));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: VisitFormPayload = {
      purpose,
      firearmUsedId: firearmUsedId || undefined,
      firearmSerialNumber: firearmSerialNumber || undefined,
    };
    if (!isAuthenticated) {
      payload.guestDetails = guestDetails;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      // Reset fields only on success. If onSubmit throws, fields are preserved so
      // the user can correct and retry (the parent handles error display and re-throws).
      setPurpose('Practice');
      setFirearmUsedId('');
      setFirearmSerialNumber('');
      setGuestDetails(EMPTY_GUEST_DETAILS);
    } catch {
      // Error already handled and re-thrown by the parent's onSubmit callback
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {!isAuthenticated && (
        <>
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #dbeafe',
              backgroundColor: '#eff6ff',
              fontSize: '12px',
              color: '#1e3a8a',
            }}
          >
            <div>
              Guests must not be prohibited under Section 21 of the Firearms Act 1968.
              {' '}
              <button
                type="button"
                onClick={() => setShowFullDeclaration(v => !v)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  color: '#1d4ed8',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {showFullDeclaration ? 'Hide full declaration' : 'View full declaration'}
              </button>
            </div>
            {showFullDeclaration && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #bfdbfe',
                  backgroundColor: '#ffffff',
                  color: '#1f2937',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.45',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {SECTION21_DECLARATION_TEXT}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Full Name *</label>
            <input
              type="text"
              value={guestDetails.guestName}
              onChange={e => setGuestDetails(d => ({ ...d, guestName: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Club/Organization You Represent *</label>
            <input
              type="text"
              value={guestDetails.guestClubRepresented}
              onChange={e => setGuestDetails(d => ({ ...d, guestClubRepresented: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Email Address (optional)</label>
            <input
              type="email"
              value={guestDetails.guestEmail}
              onChange={e => setGuestDetails(d => ({ ...d, guestEmail: e.target.value }))}
            />
          </div>
        </>
      )}

      <div className="form-group">
        <label>Purpose of Visit *</label>
        <select value={purpose} onChange={e => setPurpose(e.target.value)}>
          {VISIT_PURPOSES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Firearm Used (optional)</label>
        <select value={firearmUsedId} onChange={e => setFirearmUsedId(e.target.value)}>
          <option value="">None / Not applicable</option>
          {myFavoriteFirearms.length > 0 && (
            <optgroup label="My Favorites">
              {myFavoriteFirearms.map(f => (
                <option key={f.id} value={f.id}>
                  {formatFirearmOptionLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
          {clubFavoriteFirearms.length > 0 && (
            <optgroup label="Club Favorites">
              {clubFavoriteFirearms.map(f => (
                <option key={f.id} value={f.id}>
                  {formatFirearmOptionLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
          {myArmoryFirearms.length > 0 && (
            <optgroup label="My Armory">
              {myArmoryFirearms.map(f => (
                <option key={f.id} value={f.id}>
                  {formatFirearmOptionLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
          {clubArmoryFirearms.length > 0 && (
            <optgroup label="Club Armory">
              {clubArmoryFirearms.map(f => (
                <option key={f.id} value={f.id}>
                  {formatFirearmOptionLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="form-group">
        <label>Rifle Serial Number (optional)</label>
        <input
          type="text"
          value={firearmSerialNumber}
          onChange={e => setFirearmSerialNumber(e.target.value)}
          placeholder="Enter serial number if using personal rifle"
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%' }}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Signing in…' : submitLabel}
      </button>
    </form>
  );
}
