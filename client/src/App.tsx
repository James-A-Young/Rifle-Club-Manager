import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Navbar from './components/Navbar';
import GdprPolicyModal from './components/GdprPolicyModal';
import { useConfig } from './context/ConfigContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import DisableTwoFactor from './pages/DisableTwoFactor';
import VerifyEmail from './pages/VerifyEmail';
import Bootstrap from './pages/Bootstrap';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import ClubDashboard from './pages/ClubDashboard';
import ClubHistory from './pages/ClubHistory';
import AmmunitionHistory from './pages/AmmunitionHistory';
import Cashbox from './pages/Cashbox';
import ScoresReport from './pages/ScoresReport';
import ClubMemberProfile from './pages/ClubMemberProfile';
import InviteAccept from './pages/InviteAccept';
import SignIn from './pages/SignIn';
import KioskSignIn from './pages/KioskSignIn';
import Profile from './pages/Profile';
import MyScores from './pages/MyScores';
import ClubPublicProfile from './pages/ClubPublicProfile';
import ClubPublicBlogPostPage from './pages/ClubPublicBlogPost';
import Section21DeclarationSignUp from './pages/Section21DeclarationSignUp';
import { trackPageView } from './analytics';
import { api } from './api';

function usePageTracking(): void {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  // Redirect to declaration signup if user hasn't declared and isn't already on that page
  if (user.section21Status === 'NOT_DECLARED' && location.pathname !== '/section21-declaration-signup') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/section21-declaration-signup?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

function AuthenticatedRedirect({ to = '/' }: { to?: string }) {
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next')?.trim();
  const destination = (nextPath && nextPath.startsWith('/')) ? nextPath : to;
  return <Navigate to={destination} replace />;
}

function LoginRoute() {
  const { user } = useAuth();
  return user ? <AuthenticatedRedirect /> : <Login />;
}

function RegisterRoute() {
  const { user } = useAuth();
  return user ? <AuthenticatedRedirect /> : <Register />;
}

function HomeRoute() {
  const { user } = useAuth();
  
  if (!user) {
    const host = window.location.hostname.toLowerCase();
    const isPlatformHost = host === 'shootingmatch.app' || host === 'www.shootingmatch.app' || host === 'localhost' || host === '127.0.0.1';
    if (!isPlatformHost) {
      return <ClubPublicProfile />;
    }
    return <Landing />;
  }
  
  // If user hasn't declared Section 21, redirect to signup
  if (user.section21Status === 'NOT_DECLARED') {
    return <Navigate to="/section21-declaration-signup?next=%2F" replace />;
  }
  
  return <Dashboard />;
}

function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  if (!user || user.emailVerifiedAt) {
    return null;
  }

  const deadlineText = user.emailVerificationRequiredBy
    ? new Date(user.emailVerificationRequiredBy).toLocaleString()
    : null;

  async function resendVerificationEmail() {
    setSending(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post<{ message?: string }>('/api/auth/email-verification/resend', {});
      setMessage(response.message ?? 'Verification email sent.');
      await refreshUser().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification email.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="alert alert-info" style={{ margin: '0.75rem 1rem 0' }}>
      <strong>Please verify your email address.</strong>{' '}
      {deadlineText
        ? `Verify by ${deadlineText} to keep full access. `
        : 'Check your inbox for your verification link. '}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => void resendVerificationEmail()}
        disabled={sending}
        style={{ marginLeft: '0.5rem' }}
      >
        {sending ? 'Sending…' : 'Resend verification email'}
      </button>
      {message && <div style={{ marginTop: '0.4rem' }}>{message}</div>}
      {error && <div style={{ marginTop: '0.4rem', color: '#991b1b' }}>{error}</div>}
    </div>
  );
}

function AppRoutes() {
  const { loading } = useAuth();
  const { clientOrigin } = useConfig();
  const location = useLocation();
  const isKioskRoute = location.pathname.startsWith('/kiosk/');
  const isSection21SignUp = location.pathname === '/section21-declaration-signup';
  const host = window.location.hostname.toLowerCase();
  const isCustomDomainHost = !(host === 'shootingmatch.app' || host === 'www.shootingmatch.app' || host === 'localhost' || host === '127.0.0.1');
  const isPublicSiteRoute = location.pathname.startsWith('/clubpage/')
    || location.pathname.startsWith('/clubs/profile/')
    || location.pathname.startsWith('/blog/')
    || (isCustomDomainHost && location.pathname === '/');
  const [policyOpen, setPolicyOpen] = React.useState(false);
  usePageTracking();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      {!isKioskRoute && !isSection21SignUp && !isPublicSiteRoute && <Navbar />}
      <EmailVerificationBanner />
      <main>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/disable-2fa" element={<DisableTwoFactor />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/setup" element={<Bootstrap />} />
          <Route path="/section21-declaration-signup" element={<ProtectedRoute><Section21DeclarationSignUp /></ProtectedRoute>} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/clubs/profile/:id" element={<ClubPublicProfile />} />
          <Route path="/clubs/profile/:id/blog/:slug" element={<ClubPublicBlogPostPage />} />
          <Route path="/clubpage/:vanity" element={<ClubPublicProfile />} />
          <Route path="/clubpage/:vanity/blog/:slug" element={<ClubPublicBlogPostPage />} />
          <Route path="/blog/:slug" element={<ClubPublicBlogPostPage />} />
          <Route path="/clubs/:id" element={<ProtectedRoute><ClubDashboard /></ProtectedRoute>} />
          <Route path="/clubs/:id/history" element={<ProtectedRoute><ClubHistory /></ProtectedRoute>} />
          <Route path="/clubs/:id/ammunition-history" element={<ProtectedRoute><AmmunitionHistory /></ProtectedRoute>} />
          <Route path="/clubs/:id/cashbox" element={<ProtectedRoute><Cashbox /></ProtectedRoute>} />
          <Route path="/clubs/:id/scores-report" element={<ProtectedRoute><ScoresReport /></ProtectedRoute>} />
          <Route path="/clubs/:id/my-scores" element={<ProtectedRoute><MyScores /></ProtectedRoute>} />
          <Route path="/clubs/:id/members/:userId" element={<ProtectedRoute><ClubMemberProfile /></ProtectedRoute>} />
          <Route path="/invites/:token/accept" element={<ProtectedRoute><InviteAccept /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/sign-in/:token" element={<SignIn />} />
          <Route path="/kiosk/:token" element={<KioskSignIn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isKioskRoute && !isSection21SignUp && !isPublicSiteRoute && (
        <footer className="site-footer">
          <span>Rifle Club Manager</span>
          <button type="button" className="link-button" onClick={() => setPolicyOpen(true)}>
            Privacy Policy (UK GDPR)
          </button>
        </footer>
      )}
      <GdprPolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} clientOrigin={clientOrigin} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
