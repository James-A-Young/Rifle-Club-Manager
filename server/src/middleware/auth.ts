import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/jwt';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

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

function decodeToken(token: string): { id: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
      role: string;
    };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieToken = (req as any).cookies?.[AUTH_COOKIE_NAME];
  return typeof cookieToken === 'string' ? cookieToken : null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
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
