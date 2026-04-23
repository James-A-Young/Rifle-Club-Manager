import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import clubsRouter from './routes/clubs';
import firearmsRouter from './routes/firearms';
import visitsRouter from './routes/visits';
import signInLinksRouter from './routes/signInLinks';
import { errorHandler } from './middleware/error';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? '*' }));
  app.use(express.json());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many requests, please try again later.' },
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
