import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

import {
  requireAuth,
  attachOptionalAuth,
  resetAuthVerificationCacheForTests,
  invalidateAuthVerificationCacheForUser,
  setVerificationLookupForTests,
  resetVerificationLookupForTests,
  type AuthRequest,
} from '../../src/middleware/auth';

const findUniqueMock = vi.fn();

function mockResponse() {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  return { status, json } as unknown as Response;
}

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthVerificationCacheForTests();
    resetVerificationLookupForTests();
    setVerificationLookupForTests(findUniqueMock);
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('requireAuth returns 401 when bearer header missing', async () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAuth attaches user and calls next for valid token', async () => {
    const verifyMock = vi.mocked(jwt.verify);
    verifyMock.mockReturnValue({ id: 'u1', email: 'u1@test.com' } as never);

    const req = { headers: { authorization: 'Bearer token' } } as unknown as AuthRequest;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.user?.id).toBe('u1');
    expect(next).toHaveBeenCalledOnce();
  });

  it('attachOptionalAuth ignores invalid token and continues', () => {
    const verifyMock = vi.mocked(jwt.verify);
    verifyMock.mockImplementation(() => {
      throw new Error('bad token');
    });

    const req = { headers: { authorization: 'Bearer invalid' } } as unknown as AuthRequest;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    attachOptionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('reuses cached email verification state to avoid repeated DB reads', async () => {
    const verifyMock = vi.mocked(jwt.verify);
    verifyMock.mockReturnValue({ id: 'u1', email: 'u1@test.com' } as never);

    process.env.RESEND_API_KEY = 'configured';
    process.env.RESEND_FROM_EMAIL = 'noreply@test.com';

    findUniqueMock.mockResolvedValue({
      id: 'u1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const req1 = { headers: { authorization: 'Bearer token' }, path: '/clubs', method: 'GET' } as unknown as AuthRequest;
    const req2 = { headers: { authorization: 'Bearer token' }, path: '/clubs', method: 'GET' } as unknown as AuthRequest;
    const res = mockResponse();
    const next1 = vi.fn() as NextFunction;
    const next2 = vi.fn() as NextFunction;

    await requireAuth(req1, res, next1);
    await requireAuth(req2, res, next2);

    expect(next1).toHaveBeenCalledOnce();
    expect(next2).toHaveBeenCalledOnce();
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates a single user verification cache entry', async () => {
    const verifyMock = vi.mocked(jwt.verify);
    verifyMock.mockReturnValue({ id: 'u1', email: 'u1@test.com' } as never);

    process.env.RESEND_API_KEY = 'configured';
    process.env.RESEND_FROM_EMAIL = 'noreply@test.com';

    findUniqueMock
      .mockResolvedValueOnce({
        id: 'u1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        emailVerifiedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'u1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

    const req1 = { headers: { authorization: 'Bearer token' }, path: '/clubs', method: 'GET' } as unknown as AuthRequest;
    const req2 = { headers: { authorization: 'Bearer token' }, path: '/clubs', method: 'GET' } as unknown as AuthRequest;
    const res1 = mockResponse();
    const res2 = mockResponse();
    const next1 = vi.fn() as NextFunction;
    const next2 = vi.fn() as NextFunction;

    await requireAuth(req1, res1, next1);
    invalidateAuthVerificationCacheForUser('u1');
    await requireAuth(req2, res2, next2);

    expect((res1.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
    expect(next1).not.toHaveBeenCalled();
    expect(next2).toHaveBeenCalledOnce();
    expect(findUniqueMock).toHaveBeenCalledTimes(2);
  });
});
