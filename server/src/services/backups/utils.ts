import { createHash } from 'crypto';

export function monthStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function nextMonthStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function listMonthsBetweenInclusive(minDate: Date, maxDate: Date): Date[] {
  const start = monthStartUtc(minDate);
  const end = monthStartUtc(maxDate);
  const months: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = nextMonthStartUtc(cursor);
  }
  return months;
}

export function buildBackupFileName(dataset: 'sign-in-history' | 'sales-ledger' | 'competition-results', monthStart: Date): string {
  return `${dataset}-${monthKey(monthStart)}.csv`;
}

export function fingerprintCsv(csv: string): string {
  return createHash('sha256').update(csv).digest('hex');
}

