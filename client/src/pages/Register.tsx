import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api';
import { useConfig } from '../context/ConfigContext';
import GdprPolicyModal from '../components/GdprPolicyModal';

interface RegisterResponse {
  token: string;
  user: { id: string; name: string; email: string };
}

interface InvitePreview {
  token: string;
  expiresAt: string;
  club: {
    id: string;
    name: string;
  };
}

let turnstileScriptLoadPromise: Promise<void> | null = null;
const TURNSTILE_SCRIPT_SELECTOR = 'script[data-turnstile="true"]';

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptLoadPromise) {
    return turnstileScriptLoadPromise;
  }

  turnstileScriptLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR);
    const script = existingScript ?? document.createElement('script');

    const onLoad = () => {
      resolve();
    };
    const onError = () => {
      reject(new Error('Failed to load Cloudflare Turnstile script'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existingScript) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = 'true';
      document.head.appendChild(script);
    }
  });

  return turnstileScriptLoadPromise;
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

export default function Register() {
  const { turnstileSiteKey, clientOrigin } = useConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = useMemo(() => searchParams.get('inviteToken')?.trim() ?? '', [searchParams]);
  const nextPath = useMemo(() => {
    const next = searchParams.get('next')?.trim();
    return next && next.startsWith('/') ? next : '/';
  }, [searchParams]);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (nextPath !== '/') params.set('next', nextPath);
    const query = params.toString();
    return query ? `/login?${query}` : '/login';
  }, [nextPath]);
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
  });
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteClubName, setInviteClubName] = useState('');
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [policyOpen, setPolicyOpen] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const formErrorRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusFormErrorRef = useRef(true);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const guardianFullNameInputRef = useRef<HTMLInputElement | null>(null);
  const guardianPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const guardianDeclarationInputRef = useRef<HTMLInputElement | null>(null);
  const gdprInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inviteToken) {
      setInviteClubName('');
      setInvitePreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setInvitePreviewLoading(true);
    setInviteClubName('');

    api.get<InvitePreview>(`/api/clubs/invite-preview/${encodeURIComponent(inviteToken)}`, controller.signal)
      .then(preview => {
        setInviteClubName(preview.club.name);
      })
      .catch(() => {
        // Keep fallback invite copy without blocking registration.
      })
      .finally(() => {
        setInvitePreviewLoading(false);
      });

    return () => controller.abort();
  }, [inviteToken]);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileContainerRef.current) {
      return;
    }

    let isDisposed = false;

    const renderWidget = async () => {
      await loadTurnstileScript().catch(() => {
        setError('Captcha failed to load. Please refresh and try again.');
      });

      if (isDisposed) {
        return;
      }

      if (!window.turnstile || !turnstileContainerRef.current) {
        return;
      }

      if (turnstileWidgetIdRef.current) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }

      const widgetId = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });

      turnstileWidgetIdRef.current = String(widgetId);
    };
    void renderWidget();

    return () => {
      isDisposed = true;
      if (window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey]);

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

  function focusAndScrollToElement(element: HTMLElement | null) {
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
    });
  }

  function setFieldLevelError(message: string, element: HTMLElement | null) {
    shouldFocusFormErrorRef.current = false;
    setError(message);
    focusAndScrollToElement(element);
  }

  useEffect(() => {
    if (!passwordError) {
      return;
    }
    focusAndScrollToElement(passwordInputRef.current);
  }, [passwordError]);

  useEffect(() => {
    if (!error) {
      return;
    }
    if (!shouldFocusFormErrorRef.current) {
      shouldFocusFormErrorRef.current = true;
      return;
    }
    focusAndScrollToElement(formErrorRef.current);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requiresGuardianDeclaration = isUnder18(form.dateOfBirth);

    if (requiresGuardianDeclaration) {
      if (!form.guardianDeclarationAccepted) {
        setFieldLevelError(
          'For members under 18, a parent or guardian must declare permission to shoot and use the system.',
          guardianDeclarationInputRef.current,
        );
        return;
      }
      if (!form.guardianFullName.trim()) {
        setFieldLevelError(
          'For members under 18, parent or guardian full name is required.',
          guardianFullNameInputRef.current,
        );
        return;
      }
      if (!form.guardianPhoneNumber.trim()) {
        setFieldLevelError(
          'For members under 18, parent or guardian phone number is required.',
          guardianPhoneInputRef.current,
        );
        return;
      }
    }

    if (!form.gdprConsent) {
      setFieldLevelError('You must consent to data processing to register.', gdprInputRef.current);
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setFieldLevelError('Please complete the captcha challenge.', turnstileContainerRef.current);
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
      const data = await api.post<RegisterResponse>('/api/auth/register', {
        ...payload,
        inviteToken: inviteToken || undefined,
        turnstileToken: turnstileSiteKey ? turnstileToken : undefined,
      });
      setToken(data.token);
      // Redirect to Section 21 declaration signup after successful registration
      navigate('/section21-declaration-signup', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err) || 'Registration failed';
      if (isPasswordValidationMessage(message)) {
        setPasswordError(message);
      } else {
        shouldFocusFormErrorRef.current = true;
        setError(message);
      }
      if (turnstileSiteKey && window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
        setTurnstileToken('');
      }
    } finally {
      setLoading(false);
    }
  }

  const inviteClubLabel = inviteClubName || 'this club';

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Register</h1>
        {!inviteToken ? (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <strong>Invite required.</strong> Registration is invite-only. Please ask a club admin to send you an invite link.
          </div>
        ) : (
          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            Welcome! You have been invited to join {inviteClubLabel}. Please register if you do not have an account, or sign in if you already do.
            {invitePreviewLoading && ' Loading invite details...'}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {error && (
            <div ref={formErrorRef} className="alert alert-error" tabIndex={-1} role="alert">
              {error}
            </div>
          )}
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
              aria-describedby={passwordError ? 'register-password-error' : undefined}
            />
            {passwordError && (
              <div id="register-password-error" className="field-error-text" role="alert">
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
                  ref={guardianFullNameInputRef}
                  value={form.guardianFullName}
                  onChange={e => update('guardianFullName', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Parent or Guardian Phone Number</label>
                <input
                  ref={guardianPhoneInputRef}
                  type="tel"
                  value={form.guardianPhoneNumber}
                  onChange={e => update('guardianPhoneNumber', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <div className="checkbox-group">
                  <input
                    ref={guardianDeclarationInputRef}
                    type="checkbox"
                    id="guardian-permission"
                    checked={form.guardianDeclarationAccepted}
                    onChange={e => update('guardianDeclarationAccepted', e.target.checked)}
                    required
                  />
                  <label htmlFor="guardian-permission">
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
          {turnstileSiteKey && (
            <div className="form-group">
              <div ref={turnstileContainerRef} tabIndex={-1} />
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !inviteToken}>
            {loading ? 'Registering…' : 'Create Account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Already have an account? <Link to={loginHref}>Sign in</Link>
        </p>
      </div>
      <GdprPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} clientOrigin={clientOrigin} />
    </div>
  );
}
