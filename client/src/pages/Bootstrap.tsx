import React, { useEffect, useState } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useConfig } from '../context/ConfigContext';
import GdprPolicyModal from '../components/GdprPolicyModal';

interface BootstrapResponse {
  token: string;
  user: { id: string; name: string; email: string };
  club: { id: string; name: string };
}

function isUnder18(dateOfBirth: string): boolean {
  if (!dateOfBirth) {
    return false;
  }
  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age < 18;
}

export default function Bootstrap() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { clientOrigin } = useConfig();
  const [checking, setChecking] = useState(true);
  const [available, setAvailable] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    address: '',
    placeOfBirth: '',
    dateOfBirth: '',
    gender: '',
    disabilityStatus: '',
    guardianDeclarationAccepted: false,
    guardianFullName: '',
    guardianPhoneNumber: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhoneNumber: '',
    phoneNumber: '',
    gdprConsent: false,
    clubName: '',
  });
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const gdprInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
      return;
    }
    api.get<{ bootstrapAvailable: boolean }>('/api/auth/bootstrap-status')
      .then(data => {
        setAvailable(data.bootstrapAvailable);
        if (!data.bootstrapAvailable) {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setChecking(false));
  }, [user, navigate]);

  function update(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
    if (field === 'password') {
      setPasswordError('');
    }
  }

  function isPasswordValidationMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('password')
      && (
        normalized.includes('known data breaches')
        || normalized.includes('sequential characters')
        || normalized.includes('security requirements')
      );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requiresGuardianDeclaration = isUnder18(form.dateOfBirth);

    if (requiresGuardianDeclaration) {
      if (!form.guardianDeclarationAccepted) {
        setError('For members under 18, a parent or guardian must declare permission to shoot and use the system.');
        return;
      }
      if (!form.guardianFullName.trim()) {
        setError('For members under 18, parent or guardian full name is required.');
        return;
      }
      if (!form.guardianPhoneNumber.trim()) {
        setError('For members under 18, parent or guardian phone number is required.');
        return;
      }
    }

    if (!form.gdprConsent) {
      setError('You must consent to data processing to continue.');
      gdprInputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError('');
    setPasswordError('');
    const payload = {
      name: form.name,
      email: form.email,
      password: form.password,
      address: form.address,
      placeOfBirth: form.placeOfBirth,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      disabilityStatus: form.disabilityStatus,
      phoneNumber: form.phoneNumber,
      gdprConsent: form.gdprConsent,
      clubName: form.clubName,
      ...(requiresGuardianDeclaration
        ? {
          guardianDeclarationAccepted: form.guardianDeclarationAccepted,
          guardianFullName: form.guardianFullName.trim(),
          guardianPhoneNumber: form.guardianPhoneNumber.trim(),
        }
        : {}),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactRelation: form.emergencyContactRelation.trim(),
      emergencyContactPhoneNumber: form.emergencyContactPhoneNumber.trim(),
    };
    try {
      const data = await api.post<BootstrapResponse>('/api/auth/bootstrap', payload);
      setToken(data.token);
      // Reload auth state and navigate to Section 21 declaration signup
      await login(form.email, form.password);
      navigate('/section21-declaration-signup', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      if (isPasswordValidationMessage(message)) {
        setPasswordError(message);
        passwordInputRef.current?.focus();
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!available) return null;

  return (
    <div className="auth-page">
      <div className="card">
        <h1>First-Time Setup</h1>
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          No users exist yet. Create your admin account and first club to get started.
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Your Account</h2>
          <div className="form-group">
            <label>Full Name</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              ref={passwordInputRef}
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              required
              minLength={8}
              className={passwordError ? 'field-error-input' : undefined}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'bootstrap-password-error' : undefined}
            />
            {passwordError && (
              <div id="bootstrap-password-error" className="field-error-text" role="alert">
                {passwordError}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Address</label>
            <input value={form.address} onChange={e => update('address', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Place of Birth</label>
            <input value={form.placeOfBirth} onChange={e => update('placeOfBirth', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input type="date" value={form.dateOfBirth} onChange={e => update('dateOfBirth', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select value={form.gender} onChange={e => update('gender', e.target.value)} required>
              <option value="" disabled>Select your gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="NON_BINARY">Non-binary</option>
              <option value="OTHER">Other</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </select>
          </div>
          <div className="form-group">
            <label>Disability Status</label>
            <select value={form.disabilityStatus} onChange={e => update('disabilityStatus', e.target.value)} required>
              <option value="" disabled>Select disability status</option>
              <option value="NOT_DISABLED">Not disabled</option>
              <option value="DISABLED">Disabled</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </select>
          </div>
          {isUnder18(form.dateOfBirth) && (
            <>
              <div className="form-group">
                <label>Parent or Guardian Full Name</label>
                <input
                  value={form.guardianFullName}
                  onChange={e => update('guardianFullName', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Parent or Guardian Phone Number</label>
                <input
                  type="tel"
                  value={form.guardianPhoneNumber}
                  onChange={e => update('guardianPhoneNumber', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id="bootstrap-guardian-permission"
                    checked={form.guardianDeclarationAccepted}
                    onChange={e => update('guardianDeclarationAccepted', e.target.checked)}
                    required
                  />
                  <label htmlFor="bootstrap-guardian-permission">
                    I am the parent or legal guardian and I give permission for this member to shoot and use the system.
                  </label>
                </div>
              </div>
            </>
          )}
          <div className="form-group">
            <label>Phone Number</label>
            <input type="tel" value={form.phoneNumber} onChange={e => update('phoneNumber', e.target.value)} required />
          </div>
          <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.75rem' }}>Emergency Contact</h2>
          <div className="form-group">
            <label>Emergency Contact Name</label>
            <input
              value={form.emergencyContactName}
              onChange={e => update('emergencyContactName', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Relation</label>
            <input
              value={form.emergencyContactRelation}
              onChange={e => update('emergencyContactRelation', e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Emergency Contact Phone Number</label>
            <input
              type="tel"
              value={form.emergencyContactPhoneNumber}
              onChange={e => update('emergencyContactPhoneNumber', e.target.value)}
              required
            />
          </div>
          <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.75rem' }}>Your Club</h2>
          <div className="form-group">
            <label>Club Name</label>
            <input value={form.clubName} onChange={e => update('clubName', e.target.value)} required />
          </div>
          <div className="form-group">
            <div className="checkbox-group">
              <input
                ref={gdprInputRef}
                type="checkbox"
                id="gdpr"
                checked={form.gdprConsent}
                onChange={e => update('gdprConsent', e.target.checked)}
              />
              <label htmlFor="gdpr">
                I consent to the processing of my personal data in accordance with GDPR regulations.
              </label>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Read the GDPR policy before continuing:{' '}
              <button type="button" className="link-button" onClick={() => setPolicyOpen(true)}>
                View Privacy Policy
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Setting up…' : 'Create Admin Account & Club'}
          </button>
        </form>
      </div>
      <GdprPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} clientOrigin={clientOrigin} />
    </div>
  );
}
