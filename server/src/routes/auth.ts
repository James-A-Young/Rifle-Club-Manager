import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { MembershipStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { formatZodError } from '../utils/zodError';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  gdprConsent: z.boolean().refine((v) => v === true, { message: 'GDPR consent required' }),
  address: z.string().min(5),
  placeOfBirth: z.string().min(2),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  inviteToken: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { name, email, password, address, placeOfBirth, dateOfBirth, inviteToken } = parsed.data;

  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async tx => {
      let invite: Awaited<ReturnType<typeof tx.clubInvite.findUnique>> | null = null;
      if (inviteToken) {
        invite = await tx.clubInvite.findUnique({ where: { token: inviteToken } });
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
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      if (invite) {
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
      }

      return createdUser;
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET ?? 'secret',
      { expiresIn: '24h' }
    );

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
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET ?? 'secret',
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

export default router;
