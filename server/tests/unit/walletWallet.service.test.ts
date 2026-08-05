import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletWalletService } from '../../src/services/walletWallet';

const originalFetch = global.fetch;

describe('WalletWalletService', () => {
  beforeEach(() => {
    process.env.WALLETWALLET_API_KEY = 'ww_live_1234567890abcdef1234567890abcdef';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('reports enabled when api key exists', () => {
    const service = new WalletWalletService();
    expect(service.isEnabled()).toBe(true);
  });

  it('returns null when disabled', async () => {
    delete process.env.WALLETWALLET_API_KEY;
    const service = new WalletWalletService();

    const result = await service.createMembershipPass({
      userId: 'user-1',
      clubId: 'club-1',
      memberName: 'Test User',
      clubName: 'Test Club',
      visitCount: 0,
      roundsThisYear: 0,
      average: 0,
    });

    expect(result).toBeNull();
  });

  it('creates pass and returns serial + apple pass payload', async () => {
    const service = new WalletWalletService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        serialNumber: 'serial-123',
        applePass: 'UEsDBBQAAAAA',
        shareUrl: 'https://api.walletwallet.dev/p/serial-123',
      }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.createMembershipPass({
      userId: 'user-1',
      clubId: 'club-1',
      memberName: 'Test User',
      clubName: 'Test Club',
      visitCount: 10,
      roundsThisYear: 15,
      average: 94.5,
      averageLabel: 'Overall Last 10',
      settings: { secondaryColor: '#374151', logoUrl: 'https://example.com/logo.png' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/passes');
    expect(init.method).toBe('POST');
    expect(result?.serialNumber).toBe('serial-123');
    expect(result?.applePass).toBe('UEsDBBQAAAAA');
  });

  it('refreshes a stored serial using put', async () => {
    const service = new WalletWalletService();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        serialNumber: 'serial-123',
        unchanged: false,
      }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.refreshMembershipPass('serial-123', {
      userId: 'user-1',
      clubId: 'club-1',
      memberName: 'Test User',
      clubName: 'Test Club',
      visitCount: 11,
      roundsThisYear: 22,
      average: 90,
      averageLabel: 'Average',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/passes/serial-123');
    expect(init.method).toBe('PUT');
  });
});
