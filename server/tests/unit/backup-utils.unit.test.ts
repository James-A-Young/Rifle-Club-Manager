import { describe, it, expect } from 'vitest';
import {
  buildBackupFileName,
  fingerprintCsv,
  listMonthsBetweenInclusive,
  monthKey,
  monthStartUtc,
  nextMonthStartUtc,
} from '../../src/services/backups/utils';

describe('backup utils', () => {
  it('computes UTC month boundaries', () => {
    const date = new Date('2026-05-19T08:00:00.000Z');
    expect(monthStartUtc(date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(nextMonthStartUtc(monthStartUtc(date)).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('lists inclusive months between two dates', () => {
    const months = listMonthsBetweenInclusive(
      new Date('2026-03-15T00:00:00.000Z'),
      new Date('2026-05-02T00:00:00.000Z')
    ).map(m => monthKey(m));

    expect(months).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('builds deterministic monthly backup file names', () => {
    const month = new Date('2026-05-01T00:00:00.000Z');
    expect(buildBackupFileName('sign-in-history', month)).toBe('sign-in-history-2026-05.csv');
    expect(buildBackupFileName('sales-ledger', month)).toBe('sales-ledger-2026-05.csv');
    expect(buildBackupFileName('competition-results', month)).toBe('competition-results-2026-05.csv');
  });

  it('produces stable fingerprints for unchanged CSV and new fingerprints for changed CSV', () => {
    const csvA = 'h1,h2\n"a","b"\n';
    const csvB = 'h1,h2\n"a","c"\n';
    expect(fingerprintCsv(csvA)).toBe(fingerprintCsv(csvA));
    expect(fingerprintCsv(csvA)).not.toBe(fingerprintCsv(csvB));
  });
});

