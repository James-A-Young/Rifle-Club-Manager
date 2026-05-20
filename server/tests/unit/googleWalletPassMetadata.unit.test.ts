import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// ---------------------------------------------------------------------------
// Webhook signature validation (extracted logic tested independently)
// ---------------------------------------------------------------------------

describe('Google Wallet webhook signature validation', () => {
  const secret = 'test-webhook-secret-key';
  const timestamp = '1716192131'; // fixed timestamp
  const body = JSON.stringify({ eventType: 'resourceSave', objectId: 'test.obj' });

  function buildSignature(ts: string, rawBody: string): string {
    return createHmac('sha256', secret)
      .update(`${ts}.`)
      .update(Buffer.from(rawBody))
      .digest('hex');
  }

  it('produces a valid HMAC-SHA256 signature', () => {
    const sig = buildSignature(timestamp, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signature differs when timestamp changes', () => {
    const sig1 = buildSignature(timestamp, body);
    const sig2 = buildSignature(String(Number(timestamp) + 1), body);
    expect(sig1).not.toBe(sig2);
  });

  it('signature differs when body changes', () => {
    const sig1 = buildSignature(timestamp, body);
    const sig2 = buildSignature(timestamp, body + ' ');
    expect(sig1).not.toBe(sig2);
  });

  it('validates correctly with timing-safe comparison', () => {
    const { timingSafeEqual } = require('crypto') as typeof import('crypto');
    const sig = buildSignature(timestamp, body);
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(sig, 'hex');
    expect(timingSafeEqual(sigBuf, expBuf)).toBe(true);
  });

  it('rejects tampered signature', () => {
    const { timingSafeEqual } = require('crypto') as typeof import('crypto');
    const sig = buildSignature(timestamp, body);
    const tampered = sig.replace(/.$/, sig.endsWith('0') ? '1' : '0');
    const sigBuf = Buffer.from(tampered, 'hex');
    const expBuf = Buffer.from(sig, 'hex');
    expect(timingSafeEqual(sigBuf, expBuf)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectMemberPassDataChanges — unit tests with mocked Prisma
// ---------------------------------------------------------------------------

vi.mock('../../src/prisma', () => {
  const mockPrisma = {
    visitLog: {
      count: vi.fn(),
    },
    score: {
      findMany: vi.fn(),
    },
    clubSettings: {
      findUnique: vi.fn(),
    },
    googleWalletPassMetadata: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../../src/prisma';
import { detectMemberPassDataChanges } from '../../src/services/googleWalletPassMetadata';

const mockPrisma = prisma as unknown as {
  visitLog: { count: ReturnType<typeof vi.fn> };
  score: { findMany: ReturnType<typeof vi.fn> };
  clubSettings: { findUnique: ReturnType<typeof vi.fn> };
  googleWalletPassMetadata: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no metadata stored yet
  mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue(null);
  mockPrisma.visitLog.count.mockResolvedValue(5);
  mockPrisma.score.findMany.mockResolvedValue([{ score: 90 }, { score: 85 }]);
  mockPrisma.clubSettings.findUnique.mockResolvedValue({
    primaryColor: '#1f2937',
    secondaryColor: '#374151',
    accentColor: '#3b82f6',
    logoUrl: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectMemberPassDataChanges', () => {
  it('returns true when no metadata exists (first pass)', async () => {
    mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue(null);
    const result = await detectMemberPassDataChanges('user-1', 'club-1');
    expect(result).toBe(true);
  });

  it('returns true when fingerprint differs (new visit)', async () => {
    // Store a fingerprint based on 3 visits
    const { createHash } = await import('crypto');
    const oldFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          visitCount: 3,
          roundCount: 2,
          totalScore: 175,
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6',
          logoUrl: null,
        })
      )
      .digest('hex');

    mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue({
      lastDataFingerprint: oldFingerprint,
    });
    // Current data: 5 visits (different from 3)
    mockPrisma.visitLog.count.mockResolvedValue(5);

    const result = await detectMemberPassDataChanges('user-1', 'club-1');
    expect(result).toBe(true);
  });

  it('returns false when data is identical to stored fingerprint', async () => {
    const { createHash } = await import('crypto');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          visitCount: 5,
          roundCount: 2,
          totalScore: 175,
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6',
          logoUrl: null,
        })
      )
      .digest('hex');

    mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue({
      lastDataFingerprint: fingerprint,
    });

    const result = await detectMemberPassDataChanges('user-1', 'club-1');
    expect(result).toBe(false);
  });

  it('returns true when club settings color changes', async () => {
    const { createHash } = await import('crypto');
    const oldFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          visitCount: 5,
          roundCount: 2,
          totalScore: 175,
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6',
          logoUrl: null,
        })
      )
      .digest('hex');

    mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue({
      lastDataFingerprint: oldFingerprint,
    });
    // Different accent color
    mockPrisma.clubSettings.findUnique.mockResolvedValue({
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      accentColor: '#ef4444',
      logoUrl: null,
    });

    const result = await detectMemberPassDataChanges('user-1', 'club-1');
    expect(result).toBe(true);
  });

  it('returns true when scores are added', async () => {
    const { createHash } = await import('crypto');
    const oldFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          visitCount: 5,
          roundCount: 0,
          totalScore: 0,
          primaryColor: '#1f2937',
          secondaryColor: '#374151',
          accentColor: '#3b82f6',
          logoUrl: null,
        })
      )
      .digest('hex');

    mockPrisma.googleWalletPassMetadata.findUnique.mockResolvedValue({
      lastDataFingerprint: oldFingerprint,
    });
    // Now has 2 scores
    mockPrisma.score.findMany.mockResolvedValue([{ score: 90 }, { score: 85 }]);

    const result = await detectMemberPassDataChanges('user-1', 'club-1');
    expect(result).toBe(true);
  });
});
