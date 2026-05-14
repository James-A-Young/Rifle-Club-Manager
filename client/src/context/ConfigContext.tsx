import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { initAnalytics } from '../analytics';

export interface RuntimeConfig {
  apiUrl: string;
  turnstileSiteKey: string;
  ga_measurementId: string;
}

const ConfigContext = createContext<RuntimeConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch config from backend at app startup
    fetch('/api/config')
      .then(res => {
        if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setConfig({
          apiUrl: data.apiUrl ?? '',
          turnstileSiteKey: data.turnstileSiteKey ?? '',
          ga_measurementId: data.ga_measurementId ?? '',
        });
         // Initialize analytics here!
        if (data.ga_measurementId) {
          initAnalytics(data.ga_measurementId);
        }
      })
      .catch(err => {
        console.error('Failed to load runtime config:', err);
        setError(err.message);
        // Fallback: empty config so app doesn't crash
        setConfig({ apiUrl: '', turnstileSiteKey: '', ga_measurementId: '' });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading configuration...</div>;
  }

  if (error && !config) {
    return <div style={{ padding: '2rem', color: 'red' }}>Failed to load configuration: {error}</div>;
  }

  return (
    <ConfigContext.Provider value={config!}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): RuntimeConfig {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return config;
}
