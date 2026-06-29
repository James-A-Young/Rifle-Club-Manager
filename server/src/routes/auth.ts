import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { MembershipRole, MembershipStatus, Gender, DisabilityStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { formatZodError } from '../utils/zodError';
import { jwtSecret, JWT_ACCESS_EXPIRES } from '../config/jwt';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
  requireAuth,
  AuthRequest,
  invalidateAuthVerificationCacheForUser,
} from '../middleware/auth';
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
import { getDeclarationStatus } from '../services/section21Declaration';
import { validatePasswordSecurity } from '../services/passwordSecurity';
import { decryptStoredTwoFactorSecret, verifyTwoFactorCode } from '../services/twoFactor';

const router = Router();
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
const TWO_FACTOR_LOGIN_TOKEN_TTL = '10m';
const TWO_FACTOR_DISABLE_TOKEN_TTL_MINUTES = 15;
const EMAIL_VERIFICATION_TOKEN_TTL_DAYS = 7;
const EMAIL_VERIFICATION_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;
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
  gender: z.nativeEnum(Gender),
  disabilityStatus: z.nativeEnum(DisabilityStatus),
  phoneNumber: z.string().min(1),
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

const loginTwoFactorSchema = z.object({
  twoFactorToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

const twoFactorRecoveryRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const twoFactorRecoveryDisableSchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const confirmEmailVerificationSchema = z.object({
  token: z.string().min(1),
});

const bootstrapSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  gdprConsent: z.boolean().refine((v) => v === true, { message: 'GDPR consent required' }),
  address: z.string().min(5),
  placeOfBirth: z.string().min(2),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  gender: z.nativeEnum(Gender),
  disabilityStatus: z.nativeEnum(DisabilityStatus),
  phoneNumber: z.string().min(1),
  clubName: z.string().min(2),
});

type AccessJwtPayload = {
  id: string;
  email: string;
  purpose: 'auth';
};

type TwoFactorLoginJwtPayload = {
  id: string;
  email: string;
  purpose: '2fa-login';
};

function issueAccessToken(user: { id: string; email: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, purpose: 'auth' } satisfies AccessJwtPayload,
    jwtSecret,
    { expiresIn: JWT_ACCESS_EXPIRES }
  );
}

function issueTwoFactorLoginToken(user: { id: string; email: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, purpose: '2fa-login' } satisfies TwoFactorLoginJwtPayload,
    jwtSecret,
    { expiresIn: TWO_FACTOR_LOGIN_TOKEN_TTL }
  );
}

function verifyTwoFactorLoginToken(token: string): TwoFactorLoginJwtPayload | null {
  try {
    const payload = jwt.verify(token, jwtSecret) as Partial<TwoFactorLoginJwtPayload>;
    if (payload.purpose !== '2fa-login' || !payload.id || !payload.email) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      purpose: '2fa-login',
    };
  } catch {
    return null;
  }
}

function getEmailVerificationRequiredBy(createdAt: Date, emailVerifiedAt: Date | null): Date | null {
  if (emailVerifiedAt || !emailService.isConfigured()) {
    return null;
  }
  return new Date(createdAt.getTime() + EMAIL_VERIFICATION_GRACE_PERIOD_MS);
}

async function issueAndSendEmailVerification(params: {
  userId: string;
  email: string;
  name?: string | null;
  ip: string;
}): Promise<{ tokenIssued: boolean; emailSent: boolean }> {
  if (!emailService.isConfigured()) {
    return { tokenIssued: false, emailSent: false };
  }

  const verificationToken = `email_verify_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async tx => {
    await tx.emailVerificationToken.updateMany({
      where: {
        userId: params.userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
        usedByIp: params.ip,
        usedByUserAgent: 'superseded',
      },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: params.userId,
        token: verificationToken,
        expiresAt,
      },
    });
  });

  const emailSent = await emailService.sendEmailVerificationEmail({
    to: params.email,
    name: params.name,
    verificationToken,
    expiresInDays: EMAIL_VERIFICATION_TOKEN_TTL_DAYS,
  });

  return {
    tokenIssued: true,
    emailSent,
  };
}

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
    name, email, password, address, placeOfBirth, dateOfBirth, gender, disabilityStatus, phoneNumber, clubName,
  } = parsed.data;

  const passwordValidation = await validatePasswordSecurity(password);
  if (!passwordValidation.isValid) {
    res.status(400).json({ error: passwordValidation.error ?? 'Password does not meet security requirements' });
    return;
  }

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
          emailVerifiedAt: emailService.isConfigured() ? null : new Date(),
          passwordHash,
          gdprConsentDate: new Date(),
          address,
          placeOfBirth,
          dateOfBirth: new Date(dateOfBirth),
          gender,
          disabilityStatus,
          phoneNumber,
        },
        select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true },
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
              approvedAt: new Date(),
            },
          },
        },
      });

      return { user: createdUser, club: createdClub };
    });

    const token = issueAccessToken(user);

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
  const {
    name,
    email,
    password,
    address,
    placeOfBirth,
    dateOfBirth,
    gender,
    disabilityStatus,
    phoneNumber,
    inviteToken,
    turnstileToken,
  } = parsed.data;

  const passwordValidation = await validatePasswordSecurity(password);
  if (!passwordValidation.isValid) {
    res.status(400).json({ error: passwordValidation.error ?? 'Password does not meet security requirements' });
    return;
  }

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
          emailVerifiedAt: emailService.isConfigured() ? null : new Date(),
          passwordHash,
          gdprConsentDate: new Date(),
          address,
          placeOfBirth,
          dateOfBirth: new Date(dateOfBirth),
          gender,
          disabilityStatus,
          phoneNumber,
        },
        select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true },
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

    const token = issueAccessToken(user);

    // Set the JWT as an HttpOnly cookie so it is inaccessible to JavaScript
    // (mitigates XSS-based token theft). The token is also returned in the
    // response body for backward compatibility with API clients that use
    // the Authorization: Bearer header.
    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    auditAuthRegisterSuccess(req.ip, user.id, user.email);
    res.status(201).json({ token, user });
    void issueAndSendEmailVerification({
      userId: user.id,
      email: user.email,
      name: user.name,
      ip: req.ip ?? 'unknown',
    }).then((result) => {
      if (!result.emailSent) {
        console.warn('Email verification token issued after registration but email delivery failed.');
      }
    }).catch((error: unknown) => {
      console.error('Failed to issue email verification after registration:', error);
    });
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

router.post('/email-verification/resend', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.emailVerifiedAt) {
    res.json({ success: true, verified: true, emailSent: false, message: 'Email already verified.' });
    return;
  }

  if (!emailService.isConfigured()) {
    res.status(409).json({ error: 'Email verification is not configured.' });
    return;
  }

  const delivery = await issueAndSendEmailVerification({
    userId: user.id,
    email: user.email,
    name: user.name,
    ip: req.ip ?? 'unknown',
  }).catch((error: unknown) => {
    console.error('Failed to resend verification email:', error);
    return { tokenIssued: false, emailSent: false };
  });

  res.json({
    success: delivery.tokenIssued,
    verified: false,
    tokenIssued: delivery.tokenIssued,
    emailSent: delivery.emailSent,
    message: delivery.emailSent
      ? 'Verification email sent.'
      : delivery.tokenIssued
        ? 'Verification token issued, but email could not be sent. Please try again shortly.'
        : 'Verification token could not be issued. Please try again shortly.',
  });
});

router.post('/email-verification/confirm', async (req: Request, res: Response) => {
  const parsed = confirmEmailVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const userAgent = sanitizeUserAgent(req.get('user-agent'));
  const tokenRow = await prisma.emailVerificationToken.findUnique({
    where: { token: parsed.data.token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired verification token' });
    return;
  }

  const consumedAt = new Date();
  await prisma.$transaction(async tx => {
    const consumed = await tx.emailVerificationToken.updateMany({
      where: {
        id: tokenRow.id,
        usedAt: null,
        expiresAt: { gte: consumedAt },
      },
      data: {
        usedAt: consumedAt,
        usedByIp: req.ip,
        usedByUserAgent: userAgent,
      },
    });

    if (consumed.count !== 1) {
      throw new Error('TOKEN_CONSUMPTION_FAILED');
    }

    await tx.user.update({
      where: { id: tokenRow.userId },
      data: { emailVerifiedAt: consumedAt },
    });
  }).catch(() => {
    res.status(400).json({ error: 'Invalid or expired verification token' });
  });

  if (res.headersSent) {
    return;
  }

  invalidateAuthVerificationCacheForUser(tokenRow.userId);

  res.json({ success: true, message: 'Email verified successfully.' });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const normalizedEmail = parsed.data.email.toLowerCase();
  const { password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    auditAuthLoginFailed(req.ip, normalizedEmail);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    auditAuthLoginFailed(req.ip, normalizedEmail);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.twoFactorEnabled) {
    if (!user.twoFactorSecret) {
      res.status(403).json({ error: 'Two-factor authentication is enabled but not configured. Use account recovery.' });
      return;
    }
    const twoFactorToken = issueTwoFactorLoginToken({ id: user.id, email: user.email });
    res.json({
      requiresTwoFactor: true,
      twoFactorToken,
    });
    return;
  }

  const token = issueAccessToken({ id: user.id, email: user.email });

  const section21Status = await getDeclarationStatus(user.id);

  // Set the JWT as an HttpOnly cookie (same reasoning as register above).
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  auditAuthLoginSuccess(req.ip, user.id, user.email);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      section21Status,
      emailVerifiedAt: user.emailVerifiedAt,
      emailVerificationRequiredBy: getEmailVerificationRequiredBy(user.createdAt, user.emailVerifiedAt),
    },
  });
});

router.post('/login/2fa', async (req: Request, res: Response) => {
  const parsed = loginTwoFactorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const payload = verifyTwoFactorLoginToken(parsed.data.twoFactorToken);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired 2FA session' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      emailVerifiedAt: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    res.status(401).json({ error: '2FA is not enabled for this account' });
    return;
  }

  let decryptedSecret: string;
  try {
    decryptedSecret = decryptStoredTwoFactorSecret(user.twoFactorSecret);
  } catch {
    res.status(401).json({ error: 'Invalid authenticator code' });
    return;
  }

  if (!verifyTwoFactorCode(decryptedSecret, parsed.data.code)) {
    res.status(401).json({ error: 'Invalid authenticator code' });
    return;
  }

  const token = issueAccessToken({ id: user.id, email: user.email });
  const section21Status = await getDeclarationStatus(user.id);
  res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  auditAuthLoginSuccess(req.ip, user.id, user.email);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      section21Status,
      emailVerifiedAt: user.emailVerifiedAt,
      emailVerificationRequiredBy: getEmailVerificationRequiredBy(user.createdAt, user.emailVerifiedAt),
    },
  });
});

router.post('/2fa/recovery/request', async (req: Request, res: Response) => {
  const parsed = twoFactorRecoveryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      twoFactorEnabled: true,
    },
  });

  if (!user || !user.twoFactorEnabled) {
    res.json({ success: true, message: 'If the account is eligible, a recovery email has been sent.' });
    return;
  }

  const passwordValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    res.json({ success: true, message: 'If the account is eligible, a recovery email has been sent.' });
    return;
  }

  const recoveryToken = `2fa_disable_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_DISABLE_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction(async tx => {
    await tx.twoFactorDisableToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: {
        usedAt: new Date(),
        usedByIp: req.ip,
        usedByUserAgent: 'superseded',
      },
    });

    await tx.twoFactorDisableToken.create({
      data: {
        userId: user.id,
        token: recoveryToken,
        expiresAt,
      },
    });
  });

  await emailService.sendTwoFactorDisableEmail({
    to: user.email,
    name: user.name,
    disableToken: recoveryToken,
    expiresInMinutes: TWO_FACTOR_DISABLE_TOKEN_TTL_MINUTES,
  });

  res.json({ success: true, message: 'If the account is eligible, a recovery email has been sent.' });
});

router.post('/2fa/recovery/disable', async (req: Request, res: Response) => {
  const parsed = twoFactorRecoveryDisableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const userAgent = sanitizeUserAgent(req.get('user-agent'));

  const tokenRow = await prisma.twoFactorDisableToken.findUnique({
    where: { token: parsed.data.token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired recovery token' });
    return;
  }

  const consumedAt = new Date();
  await prisma.$transaction(async tx => {
    const consumed = await tx.twoFactorDisableToken.updateMany({
      where: {
        id: tokenRow.id,
        usedAt: null,
        expiresAt: { gte: consumedAt },
      },
      data: {
        usedAt: consumedAt,
        usedByIp: req.ip,
        usedByUserAgent: userAgent,
      },
    });

    if (consumed.count !== 1) {
      throw new Error('TOKEN_CONSUMPTION_FAILED');
    }

    await tx.user.update({
      where: { id: tokenRow.userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
        twoFactorPendingExpiresAt: null,
      },
    });
  }).catch(() => {
    res.status(400).json({ error: 'Invalid or expired recovery token' });
  });

  if (res.headersSent) {
    return;
  }

  res.clearCookie(AUTH_COOKIE_NAME, { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  res.json({ success: true, message: 'Two-factor authentication has been disabled.' });
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

  const passwordValidation = await validatePasswordSecurity(password);
  if (!passwordValidation.isValid) {
    res.status(400).json({ error: passwordValidation.error ?? 'Password does not meet security requirements' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const updatedUser = await prisma.$transaction(async tx => {
      const existingToken = await tx.passwordResetToken.findUnique({
        where: { token },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!existingToken) {
        throw new ResetTokenStateError('not_found');
      }
      if (existingToken.usedAt) {
        throw new ResetTokenStateError('used');
      }
      if (existingToken.expiresAt < new Date()) {
        throw new ResetTokenStateError('expired');
      }

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
        if (latestState.expiresAt < usedAt) {
          throw new ResetTokenStateError('expired');
        }
        console.error('Password reset token entered inconsistent state during consumption', {
          resetTokenId: existingToken.id,
          usedAt: latestState.usedAt,
          expiresAt: latestState.expiresAt,
        });
        throw new Error('TOKEN_STATE_INCONSISTENT');
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
