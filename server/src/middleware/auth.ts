import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

function decodeBearerToken(token: string): { id: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET ?? 'secret') as {
      id: string;
      email: string;
      role: string;
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.substring(7);
  const payload = decodeBearerToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.user = payload;
  next();
}

export function attachOptionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = decodeBearerToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}
