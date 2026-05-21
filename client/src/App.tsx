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
import ClubPublicProfile from './pages/ClubPublicProfile';
import Section21DeclarationSignUp from './pages/Section21DeclarationSignUp';
import { trackPageView } from './analytics';

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
  return user ? <Dashboard /> : <Landing />;
}

function AppRoutes() {
  const { loading } = useAuth();
  const { clientOrigin } = useConfig();
  const location = useLocation();
  const isKioskRoute = location.pathname.startsWith('/kiosk/');
  const isSection21SignUp = location.pathname === '/section21-declaration-signup';
  const [policyOpen, setPolicyOpen] = React.useState(false);
  usePageTracking();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      {!isKioskRoute && !isSection21SignUp && <Navbar />}
      <main>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup" element={<Bootstrap />} />
          <Route path="/section21-declaration-signup" element={<ProtectedRoute><Section21DeclarationSignUp /></ProtectedRoute>} />
          <Route path="/" element={<HomeRoute />} />
          <Route path="/clubs/profile/:id" element={<ClubPublicProfile />} />
          <Route path="/clubs/:id" element={<ProtectedRoute><ClubDashboard /></ProtectedRoute>} />
          <Route path="/clubs/:id/history" element={<ProtectedRoute><ClubHistory /></ProtectedRoute>} />
          <Route path="/clubs/:id/ammunition-history" element={<ProtectedRoute><AmmunitionHistory /></ProtectedRoute>} />
          <Route path="/clubs/:id/cashbox" element={<ProtectedRoute><Cashbox /></ProtectedRoute>} />
          <Route path="/clubs/:id/scores-report" element={<ProtectedRoute><ScoresReport /></ProtectedRoute>} />
          <Route path="/clubs/:id/members/:userId" element={<ProtectedRoute><ClubMemberProfile /></ProtectedRoute>} />
          <Route path="/invites/:token/accept" element={<ProtectedRoute><InviteAccept /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/sign-in/:token" element={<SignIn />} />
          <Route path="/kiosk/:token" element={<KioskSignIn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isKioskRoute && !isSection21SignUp && (
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
