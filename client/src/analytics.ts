
let activeMeasurementId = '';
let initialized = false;

function normalizeMeasurementId(raw: string): string {
  return raw.trim().toUpperCase();
}

export function initAnalytics(gaId: string): void {
  const normalizedGaId = normalizeMeasurementId(gaId);
  if (!normalizedGaId) return;

  activeMeasurementId = normalizedGaId;

  if (initialized) {
    return;
  }

  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${normalizedGaId}`;
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
  if (!existingScript) {
    const script = document.createElement('script');
    script.async = true;
    script.src = scriptSrc;
    script.onerror = () => {
      console.warn('Google Analytics script failed to load. Check CSP, ad blockers, and network policy.');
    };
    document.head.appendChild(script);
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag() {
    window.dataLayer!.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', normalizedGaId, {
    send_page_view: false,
    transport_type: 'beacon',
  });

  initialized = true;
}

export function trackPageView(path: string): void {
  if (typeof window.gtag !== 'function' || !activeMeasurementId) return;

  window.gtag('event', 'page_view', {
    send_to: activeMeasurementId,
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: document.title,
    transport_type: 'beacon',
  });
}
