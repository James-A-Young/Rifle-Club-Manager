import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/jwt';

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const EMAIL_VERIFICATION_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_CACHE_TTL_MS = 5 * 60 * 1000;
const EMAIL_VERIFICATION_CACHE_MAX_SIZE = 10_000;

type VerificationCacheEntry = {
  createdAtMs: number;
  isEmailVerified: boolean;
  expiresAtMs: number;
};

type VerificationLookupResult = {
  createdAt: Date;
  emailVerifiedAt: Date | null;
} | null;

type VerificationLookup = (userId: string) => Promise<VerificationLookupResult>;

const emailVerificationCache = new Map<string, VerificationCacheEntry>();

let verificationLookup: VerificationLookup = async (userId: string) => {
  const { prisma } = await import('../prisma');
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      emailVerifiedAt: true,
    },
  });
};

/** Name of the HttpOnly cookie that carries the auth JWT. */
export const AUTH_COOKIE_NAME = 'auth_token';

/** Cookie options shared by login (set) and logout (clear). */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 24 * 60 * 60 * 1000, // 24 h, matches JWT_ACCESS_EXPIRES
  path: '/',
};

function decodeToken(token: string): { id: string; email: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
      purpose?: string;
    };
    if (payload.purpose && payload.purpose !== 'auth') {
      return null;
    }
    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Extract the auth token from the request.
 * Priority: Authorization: Bearer header (backward-compat) → HttpOnly cookie.
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const requestWithCookies = req as Request & { cookies?: Record<string, string | undefined> };
  const cookieToken = requestWithCookies.cookies?.[AUTH_COOKIE_NAME];
  return typeof cookieToken === 'string' ? cookieToken : null;
}

function getVerificationCacheEntry(userId: string): VerificationCacheEntry | null {
  const entry = emailVerificationCache.get(userId);
  if (!entry) {
    return null;
  }

  if (entry.expiresAtMs <= Date.now()) {
    emailVerificationCache.delete(userId);
    return null;
  }

  return entry;
}

function setVerificationCacheEntry(userId: string, createdAt: Date, emailVerifiedAt: Date | null): void {
  if (emailVerificationCache.size >= EMAIL_VERIFICATION_CACHE_MAX_SIZE) {
    const oldestKey = emailVerificationCache.keys().next().value;
    if (oldestKey) {
      emailVerificationCache.delete(oldestKey);
    }
  }

  emailVerificationCache.set(userId, {
    createdAtMs: createdAt.getTime(),
    isEmailVerified: Boolean(emailVerifiedAt),
    expiresAtMs: Date.now() + EMAIL_VERIFICATION_CACHE_TTL_MS,
  });
}

export function resetAuthVerificationCacheForTests(): void {
  emailVerificationCache.clear();
}

export function setVerificationLookupForTests(lookup: VerificationLookup): void {
  verificationLookup = lookup;
}

export function resetVerificationLookupForTests(): void {
  verificationLookup = async (userId: string) => {
    const { prisma } = await import('../prisma');
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        emailVerifiedAt: true,
      },
    });
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const payload = decodeToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.user = payload;

  const shouldBypassVerificationGate = (
    (req.path === '/me' && req.method === 'GET')
    || (req.path === '/email-verification/resend' && req.method === 'POST')
  );

  if (!shouldBypassVerificationGate && process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()) {
    const cachedVerificationState = getVerificationCacheEntry(payload.id);

    let createdAtMs: number;
    let isEmailVerified: boolean;

    if (cachedVerificationState) {
      createdAtMs = cachedVerificationState.createdAtMs;
      isEmailVerified = cachedVerificationState.isEmailVerified;
    } else {
      let dbUser;
      try {
        dbUser = await verificationLookup(payload.id);
      } catch (err) {
        next(err);
        return;
      }

      if (!dbUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      setVerificationCacheEntry(payload.id, dbUser.createdAt, dbUser.emailVerifiedAt);

      createdAtMs = dbUser.createdAt.getTime();
      isEmailVerified = Boolean(dbUser.emailVerifiedAt);
    }

    if (!isEmailVerified) {
      const verificationDeadline = new Date(createdAtMs + EMAIL_VERIFICATION_GRACE_PERIOD_MS);
      if (verificationDeadline < new Date()) {
        res.status(403).json({
          error: 'Email verification required to continue using the system.',
          code: 'EMAIL_VERIFICATION_REQUIRED',
          emailVerificationRequiredBy: verificationDeadline,
        });
        return;
      }
    }
  }

  next();
}

export function attachOptionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const payload = decodeToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}
