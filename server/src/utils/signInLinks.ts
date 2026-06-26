const KIOSK_LINK_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

export function isKioskLink(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() > KIOSK_LINK_THRESHOLD_MS;
}
