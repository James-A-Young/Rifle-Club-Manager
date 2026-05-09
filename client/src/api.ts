import { RuntimeConfig } from './context/ConfigContext';

let runtimeConfig: RuntimeConfig | null = null;

export function setRuntimeConfig(config: RuntimeConfig): void {
  runtimeConfig = config;
}

function getApiBase(): string {
  // If config has been set by ConfigProvider, use it
  if (runtimeConfig?.apiUrl) {
    return runtimeConfig.apiUrl;
  }
  // Fallback: relative URLs work fine for same-origin requests
  return '';
}

/**
 * Retrieve the auth token from localStorage (legacy / API-client fallback).
 * Browser sessions rely on the HttpOnly cookie set by the server.
 */
function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function clearToken(): void {
  localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
    // Include credentials so the HttpOnly auth cookie is sent with every
    // request. This is the primary auth mechanism for browser sessions;
    // the Authorization header is a backward-compat fallback for API clients.
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const errorMessage =
      (body as { error?: string | { message?: string } }).error ||
      ((body as { message?: string }).message) ||
      res.statusText;
    const message = typeof errorMessage === 'string' ? errorMessage : (errorMessage?.message ?? res.statusText);
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
