import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { requireAuth, attachOptionalAuth, type AuthRequest } from '../../src/middleware/auth';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

function mockResponse() {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  return { status, json } as unknown as Response;
}

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requireAuth returns 401 when bearer header missing', () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('requireAuth attaches user and calls next for valid token', () => {
    const verifyMock = vi.mocked(jwt.verify);
    verifyMock.mockReturnValue({ id: 'u1', email: 'u1@test.com' } as never);

    const req = { headers: { authorization: 'Bearer token' } } as unknown as AuthRequest;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

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
});
