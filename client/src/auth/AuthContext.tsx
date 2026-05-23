import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setToken, clearToken } from '../api';

interface User {
  id: string;
  name: string;
  email: string;
  section21Status?: 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED';
}

export type LoginResult =
  | { requiresTwoFactor: false }
  | { requiresTwoFactor: true; twoFactorToken: string };

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactorLogin: (twoFactorToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    const refreshed = await api.get<User>('/api/users/me');
    setUser(refreshed);
  }

  useEffect(() => {
    // Always attempt to restore session. The server will authenticate via
    // the HttpOnly cookie automatically; falling back to the localStorage
    // token via the Authorization header if present.
    refreshUser()
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string): Promise<LoginResult> {
    const data = await api.post<
      | { token: string; user: User }
      | { requiresTwoFactor: true; twoFactorToken: string }
    >('/api/auth/login', { email, password });

    if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
      return {
        requiresTwoFactor: true,
        twoFactorToken: data.twoFactorToken,
      };
    }

    if (!('token' in data)) {
      throw new Error('Unexpected login response');
    }

    // Store token in localStorage for API clients / Authorization header fallback.
    // The server also sets an HttpOnly cookie which is the primary browser mechanism.
    setToken(data.token);
    setUser(data.user);
    return { requiresTwoFactor: false };
  }

  async function completeTwoFactorLogin(twoFactorToken: string, code: string): Promise<void> {
    const data = await api.post<{ token: string; user: User }>('/api/auth/login/2fa', {
      twoFactorToken,
      code,
    });
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    // Tell the server to clear the HttpOnly cookie, then clean up client state.
    await api.post('/api/auth/logout', {}).catch(() => undefined);
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, completeTwoFactorLogin, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
