import React, { useState } from 'react';
import { VISIT_PURPOSES, GuestDetails, EMPTY_GUEST_DETAILS } from '../shared/signIn';
import { SimpleFirearm } from '../types/club';

export interface VisitFormPayload {
  purpose: string;
  firearmUsedId?: string;
  firearmSerialNumber?: string;
  guestDetails?: GuestDetails;
}

interface Props {
  clubFirearms: SimpleFirearm[];
  /** When true, guest-detail fields are hidden (authenticated user is signing in). */
  isAuthenticated: boolean;
  /** Called with the built payload. Should throw on API error so the form can stay populated. */
  onSubmit: (payload: VisitFormPayload) => Promise<void>;
  submitLabel?: string;
}

export default function VisitSignInForm({
  clubFirearms,
  isAuthenticated,
  onSubmit,
  submitLabel = 'Sign In',
}: Props) {
  const [purpose, setPurpose] = useState('Practice');
  const [firearmUsedId, setFirearmUsedId] = useState('');
  const [firearmSerialNumber, setFirearmSerialNumber] = useState('');
  const [guestDetails, setGuestDetails] = useState<GuestDetails>(EMPTY_GUEST_DETAILS);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          {clubFirearms.length > 0 && (
            <optgroup label="Club Firearms">
              {clubFirearms.map(f => (
                <option key={f.id} value={f.id}>
                  {f.make} {f.model} ({f.caliber})
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
