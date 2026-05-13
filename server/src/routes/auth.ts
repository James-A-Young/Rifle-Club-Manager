import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { formatZodError } from '../utils/zodError';
import { jwtSecret, JWT_ACCESS_EXPIRES } from '../config/jwt';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '../middleware/auth';
import {
  auditAuthLoginFailed,
  auditAuthLoginSuccess,
  auditAuthPasswordResetRequested,
  auditAuthPasswordResetSuccess,
  auditAuthPasswordResetTokenInvalid,
  auditAuthRegisterSuccess,
} from '../middleware/auditLog';
import { isTurnstileEnabled, verifyTurnstileToken } from '../utils/turnstile';
import { emailService, sanitizeUserAgent } from '../services/email';

const router = Router();
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
type ResetTokenFailureReason = 'not_found' | 'expired' | 'used';

class ResetTokenStateError extends Error {
  readonly reason: ResetTokenFailureReason;

  constructor(reason: ResetTokenFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  gdprConsent: z.boolean().refine((v) => v === true, { message: 'GDPR consent required' }),
  address: z.string().min(5),
  placeOfBirth: z.string().min(2),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  inviteToken: z.string().min(1),
  turnstileToken: z.string().min(1).optional(),
}).superRefine((data, ctx) => {
  if (isTurnstileEnabled() && !data.turnstileToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['turnstileToken'],
      message: 'Captcha token is required',
    });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const bootstrapSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  gdprConsent: z.boolean().refine((v) => v === true, { message: 'GDPR consent required' }),
  address: z.string().min(5),
  placeOfBirth: z.string().min(2),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  clubName: z.string().min(2),
});

/** Returns true when no users exist — bootstrap mode is active. */
async function isBootstrapAvailable(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0;
}

/**
 * GET /api/auth/bootstrap-status
 * Public endpoint. Returns whether the first-deploy bootstrap is available.
 */
router.get('/bootstrap-status', async (_req: Request, res: Response) => {
  const bootstrapAvailable = await isBootstrapAvailable();
  res.json({ bootstrapAvailable });
});

/**
 * POST /api/auth/bootstrap
 * One-time endpoint to create the first user and first club.
 * Automatically disabled once any user exists.
 */
router.post('/bootstrap', async (req: Request, res: Response) => {
  const available = await isBootstrapAvailable();
  if (!available) {
    res.status(403).json({ error: 'Bootstrap is no longer available', code: 'BOOTSTRAP_DISABLED' });
    return;
  }

  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const {
    name, email, password, address, placeOfBirth, dateOfBirth, clubName,
  } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { user, club } = await prisma.$transaction(async tx => {
      // Double-check inside transaction to guard against races
      const count = await tx.user.count();
      if (count !== 0) {
        throw new Error('BOOTSTRAP_DISABLED');
      }

      const createdUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          gdprConsentDate: new Date(),
          address,
          placeOfBirth,
          dateOfBirth: new Date(dateOfBirth),
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });

      const createdClub = await tx.club.create({
        data: {
          name: clubName,
          ownerId: createdUser.id,
          memberships: {
            create: {
              userId: createdUser.id,
              status: MembershipStatus.APPROVED,
              role: MembershipRole.ADMIN,
            },
          },
        },
      });

      return { user: createdUser, club: createdClub };
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_ACCESS_EXPIRES }
    );

    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    auditAuthRegisterSuccess(req.ip, user.id, user.email);
    res.status(201).json({ token, user, club });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'BOOTSTRAP_FAILED';
    if (message === 'BOOTSTRAP_DISABLED') {
      res.status(403).json({ error: 'Bootstrap is no longer available', code: 'BOOTSTRAP_DISABLED' });
      return;
    }
    res.status(500).json({ error: 'Bootstrap failed' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { name, email, password, address, placeOfBirth, dateOfBirth, inviteToken, turnstileToken } = parsed.data;

  if (isTurnstileEnabled()) {
    const turnstileValid = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileValid) {
      res.status(400).json({ error: 'Captcha verification failed' });
      return;
    }
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async tx => {
      const invite = await tx.clubInvite.findUnique({ where: { token: inviteToken } });
      if (!invite) {
        throw new Error('INVITE_NOT_FOUND');
      }
      if (invite.redeemedAt) {
        throw new Error('INVITE_REDEEMED');
      }
      if (invite.expiresAt < new Date()) {
        throw new Error('INVITE_EXPIRED');
      }
      if (invite.email.toLowerCase() !== normalizedEmail) {
        throw new Error('INVITE_EMAIL_MISMATCH');
      }

      const createdUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          gdprConsentDate: new Date(),
          address,
          placeOfBirth,
          dateOfBirth: new Date(dateOfBirth),
        },
        select: { id: true, name: true, email: true, createdAt: true },
      });

      await tx.clubMembership.upsert({
        where: {
          userId_clubId: {
            userId: createdUser.id,
            clubId: invite.clubId,
          },
        },
        update: {
          role: invite.role,
          status: MembershipStatus.PENDING,
        },
        create: {
          userId: createdUser.id,
          clubId: invite.clubId,
          role: invite.role,
          status: MembershipStatus.PENDING,
        },
      });

      const markRedeemed = await tx.clubInvite.updateMany({
        where: {
          id: invite.id,
          redeemedAt: null,
        },
        data: {
          redeemedAt: new Date(),
          redeemedByUserId: createdUser.id,
        },
      });

      if (markRedeemed.count !== 1) {
        throw new Error('INVITE_REDEEMED');
      }

      return createdUser;
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      jwtSecret,
      { expiresIn: JWT_ACCESS_EXPIRES }
    );

    // Set the JWT as an HttpOnly cookie so it is inaccessible to JavaScript
    // (mitigates XSS-based token theft). The token is also returned in the
    // response body for backward compatibility with API clients that use
    // the Authorization: Bearer header.
    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    auditAuthRegisterSuccess(req.ip, user.id, user.email);
    res.status(201).json({ token, user });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'REGISTER_FAILED';
    if (message === 'INVITE_NOT_FOUND') {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (message === 'INVITE_REDEEMED') {
      res.status(409).json({ error: 'Invite already redeemed' });
      return;
    }
    if (message === 'INVITE_EXPIRED') {
      res.status(410).json({ error: 'Invite expired' });
      return;
    }
    if (message === 'INVITE_EMAIL_MISMATCH') {
      res.status(403).json({ error: 'Invite email does not match registration email' });
      return;
    }

    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    auditAuthLoginFailed(req.ip, email);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    auditAuthLoginFailed(req.ip, email);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    jwtSecret,
    { expiresIn: JWT_ACCESS_EXPIRES }
  );

  // Set the JWT as an HttpOnly cookie (same reasoning as register above).
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  auditAuthLoginSuccess(req.ip, user.id, user.email);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    res.json({ success: true, message: 'If the account exists, a password reset email has been sent.' });
    return;
  }

  const token = `pwreset_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction(async tx => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: {
        usedAt: new Date(),
        usedByIp: req.ip,
        usedByUserAgent: 'superseded',
      },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });
  });

  const emailSent = await emailService.sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetToken: token,
    expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
  });

  auditAuthPasswordResetRequested(req.ip, user.id, user.email, emailSent);
  res.json({ success: true, message: 'If the account exists, a password reset email has been sent.' });
});

router.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { token, password } = parsed.data;
  const userAgent = sanitizeUserAgent(req.get('user-agent'));
  const existingToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!existingToken) {
    auditAuthPasswordResetTokenInvalid(req.ip, 'not_found');
    res.status(400).json({ error: 'Invalid or expired reset token' });
    return;
  }
  if (existingToken.usedAt) {
    auditAuthPasswordResetTokenInvalid(req.ip, 'used');
    res.status(400).json({ error: 'Invalid or expired reset token' });
    return;
  }
  if (existingToken.expiresAt < new Date()) {
    auditAuthPasswordResetTokenInvalid(req.ip, 'expired');
    res.status(400).json({ error: 'Invalid or expired reset token' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const updatedUser = await prisma.$transaction(async tx => {
      const usedAt = new Date();
      const markUsed = await tx.passwordResetToken.updateMany({
        where: {
          id: existingToken.id,
          usedAt: null,
          expiresAt: { gte: usedAt },
        },
        data: {
          usedAt,
          usedByIp: req.ip,
          usedByUserAgent: userAgent,
        },
      });
      if (markUsed.count !== 1) {
        const latestState = await tx.passwordResetToken.findUnique({
          where: { id: existingToken.id },
          select: { usedAt: true, expiresAt: true },
        });
        if (!latestState) {
          throw new ResetTokenStateError('not_found');
        }
        if (latestState.usedAt) {
          throw new ResetTokenStateError('used');
        }
        if (latestState.expiresAt < new Date()) {
          throw new ResetTokenStateError('expired');
        }
        throw new ResetTokenStateError('used');
      }

      await tx.user.update({
        where: { id: existingToken.userId },
        data: { passwordHash },
      });

      return existingToken.user;
    });

    auditAuthPasswordResetSuccess(req.ip, updatedUser.id, updatedUser.email, userAgent);
    res.json({ success: true, message: 'Password reset successful.' });
  } catch (error) {
    if (error instanceof ResetTokenStateError) {
      auditAuthPasswordResetTokenInvalid(req.ip, error.reason);
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }
    console.error('Password reset failed unexpectedly:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Logout endpoint — clears the auth cookie server-side.
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  res.json({ success: true });
});

export default router;
