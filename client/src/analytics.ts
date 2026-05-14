
export function initAnalytics(gaId: string): void {
  if (!gaId) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args as unknown as IArguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { send_page_view: false });
}

export function trackPageView(path: string): void {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', { page_path: path });
}
