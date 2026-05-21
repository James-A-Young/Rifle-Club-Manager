import React, { useMemo, useState } from 'react';
import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!token) {
      setError('Missing reset token.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      passwordInputRef.current?.focus();
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      confirmPasswordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError('');
    setPasswordError('');
    setSuccess('');
    try {
      const response = await api.post<{ message?: string }>('/api/auth/reset-password', {
        token,
        password,
      });
      setSuccess(response.message ?? 'Password reset successful.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reset password';
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

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Reset Password</h1>
        {!token && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            Missing reset token. Please use the link from your email.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <div className="form-group">
            <label>New Password</label>
            <input
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              minLength={8}
              required
              className={passwordError ? 'field-error-input' : undefined}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'reset-password-error' : undefined}
            />
            {passwordError && (
              <div id="reset-password-error" className="field-error-text" role="alert">
                {passwordError}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              ref={confirmPasswordInputRef}
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading || !token}>
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          Back to <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
