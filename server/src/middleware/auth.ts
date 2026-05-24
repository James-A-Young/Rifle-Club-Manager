import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/jwt';
import { prisma } from '../prisma';

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

const EMAIL_VERIFICATION_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

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
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
    });

    if (!dbUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!dbUser.emailVerifiedAt) {
      const verificationDeadline = new Date(dbUser.createdAt.getTime() + EMAIL_VERIFICATION_GRACE_PERIOD_MS);
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
