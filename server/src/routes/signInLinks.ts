import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole } from '@prisma/client';

const router = Router();

router.use(requireAuth);

const createLinkSchema = z.object({
  clubId: z.string(),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const adminMembership = await prisma.clubMembership.findFirst({
    where: {
      clubId: parsed.data.clubId,
      userId: req.user!.id,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });
  if (!adminMembership) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000);

  const link = await prisma.signInLink.create({
    data: {
      clubId: parsed.data.clubId,
      cryptoToken: token,
      expiresAt,
    },
  });

  res.status(201).json(link);
});

router.get('/:token', async (req: AuthRequest, res: Response) => {
  const cryptoToken = req.params.token as string;
  const link = await prisma.signInLink.findUnique({
    where: { cryptoToken },
    include: {
      club: {
        include: {
          firearms: true,
        },
      },
    },
  });

  if (!link) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (link.expiresAt < new Date()) {
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  res.json(link);
});

export default router;
