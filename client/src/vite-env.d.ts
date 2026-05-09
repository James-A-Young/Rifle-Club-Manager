/// <reference types="vite/client" />

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
}
