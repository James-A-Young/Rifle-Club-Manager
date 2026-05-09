/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type GtagCommand = 'js' | 'config' | 'event' | 'set' | 'get' | 'consent';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | number;
  reset: (widgetId: string | number) => void;
  remove: (widgetId: string | number) => void;
}

interface Window {
  turnstile?: TurnstileApi;
  gtag?: (command: GtagCommand, ...args: unknown[]) => void;
  dataLayer?: IArguments[];
}
