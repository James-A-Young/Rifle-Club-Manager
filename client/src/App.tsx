import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ClubDashboard from './pages/ClubDashboard';
import ClubHistory from './pages/ClubHistory';
import ClubMemberProfile from './pages/ClubMemberProfile';
import InviteAccept from './pages/InviteAccept';
import SignIn from './pages/SignIn';
import KioskSignIn from './pages/KioskSignIn';
import Profile from './pages/Profile';

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

function AppRoutes() {
  const { loading } = useAuth();
  const location = useLocation();
  const isKioskRoute = location.pathname.startsWith('/kiosk/');
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <>
      {!isKioskRoute && <Navbar />}
      <main>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/clubs/:id" element={<ProtectedRoute><ClubDashboard /></ProtectedRoute>} />
          <Route path="/clubs/:id/history" element={<ProtectedRoute><ClubHistory /></ProtectedRoute>} />
          <Route path="/clubs/:id/members/:userId" element={<ProtectedRoute><ClubMemberProfile /></ProtectedRoute>} />
          <Route path="/invites/:token/accept" element={<ProtectedRoute><InviteAccept /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/sign-in/:token" element={<SignIn />} />
          <Route path="/kiosk/:token" element={<KioskSignIn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
