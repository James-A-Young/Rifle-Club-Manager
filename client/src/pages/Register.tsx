import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api';
import { useConfig } from '../context/ConfigContext';

interface RegisterResponse {
  token: string;
  user: { id: string; name: string; email: string; role: string };
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

export default function Register() {
  const { turnstileSiteKey } = useConfig();
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
    gdprConsent: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gdprConsent) {
      setError('You must consent to data processing to register.');
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError('Please complete the captcha challenge.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.post<RegisterResponse>('/api/auth/register', {
        ...form,
        inviteToken: inviteToken || undefined,
        turnstileToken: turnstileSiteKey ? turnstileToken : undefined,
      });
      setToken(data.token);
      navigate(inviteToken ? '/' : nextPath, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err) || 'Registration failed';
      setError(message);
      if (turnstileSiteKey && window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
        setTurnstileToken('');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Register</h1>
        {inviteToken && (
          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            You are registering with a club invite. Use the invited email address to complete registration.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
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
            <input type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={8} />
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
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="gdpr"
                checked={form.gdprConsent}
                onChange={e => update('gdprConsent', e.target.checked)}
              />
              <label htmlFor="gdpr">
                I consent to the processing of my personal data in accordance with GDPR regulations.
              </label>
            </div>
          </div>
          {turnstileSiteKey && (
            <div className="form-group">
              <div ref={turnstileContainerRef} />
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Registering…' : 'Create Account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Already have an account? <Link to={loginHref}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
