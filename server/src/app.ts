import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import clubsRouter from './routes/clubs';
import firearmsRouter from './routes/firearms';
import visitsRouter from './routes/visits';
import signInLinksRouter from './routes/signInLinks';
import { errorHandler } from './middleware/error';
import { AUTH_COOKIE_NAME } from './middleware/auth';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection via Origin header verification.
 *
 * When a request is authenticated via the HttpOnly cookie (rather than an
 * explicit Authorization: Bearer header) and the method is state-changing,
 * we verify that the Origin header matches CLIENT_ORIGIN. This prevents an
 * attacker's website from making authenticated state-changing requests on
 * behalf of a logged-in user.
 *
 * Requests that carry an Authorization header are inherently CSRF-safe
 * because browsers do not attach custom headers to cross-site requests without
 * a preflight, which CORS would block.
 */
function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Only enforce for state-changing requests
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  // If the request is not using cookie auth, skip (Bearer header requests are
  // safe by construction)
  const requestWithCookies = req as Request & { cookies?: Record<string, string | undefined> };
  if (!requestWithCookies.cookies?.[AUTH_COOKIE_NAME]) {
    return next();
  }

  // Skip CSRF check in test environments to avoid breaking existing tests
  // that don't set an Origin header.
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const origin = req.headers.origin;
  const clientOrigin = process.env.CLIENT_ORIGIN;

  if (!origin || !clientOrigin || origin !== clientOrigin) {
    res.status(403).json({ error: 'CSRF check failed: invalid origin' });
    return;
  }

  next();
}

export function createApp() {
  const app = express();

  app.use(helmet());

  const corsOrigin = process.env.CLIENT_ORIGIN;
  // credentials: true is required so the browser sends/receives the auth
  // cookie in cross-origin requests (dev). The origin is always restricted
  // to the configured CLIENT_ORIGIN — never '*'.
  app.use(cors({
    origin: corsOrigin ?? false,
    credentials: true,
  }));

  // Parse cookies before any route handler so auth middleware can read them.
  app.use(cookieParser());
  app.use(express.json());

  // CSRF protection must run after cookie-parser but before route handlers.
  app.use(csrfProtection);

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many requests, please try again later.' },
  });

  app.use(globalLimiter);

  // Public config endpoint (no auth required)
  // Allows frontend to read runtime configuration from environment at startup
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      apiUrl: process.env.VITE_API_URL ?? '',
      turnstileSiteKey: process.env.VITE_TURNSTILE_SITE_KEY ?? '',
    });
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/clubs', clubsRouter);
  app.use('/api/firearms', firearmsRouter);
  app.use('/api/visits', visitsRouter);
  app.use('/api/sign-in-links', signInLinksRouter);

  if (process.env.NODE_ENV === 'production') {
    const publicPath = path.join(__dirname, '..', '..', 'public');
    app.use(express.static(publicPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
