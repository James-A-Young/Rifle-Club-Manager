import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import { jwtSecret, JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES } from '../config/jwt';
import { auditSignInLinkInvalid } from '../middleware/auditLog';

const router = Router();

const KIOSK_LINK_MIN_HOURS = 24 * 365 * 5;

const createLinkSchema = z.object({
  clubId: z.string(),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

const createKioskLinkSchema = z.object({
  clubId: z.string(),
});

const issueQrSchema = z.object({
  expiresInMinutes: z.number().int().min(1).max(60).default(5),
});

async function ensureAdminForClub(userId: string, clubId: string): Promise<boolean> {
  const adminMembership = await prisma.clubMembership.findFirst({
    where: {
      clubId,
      userId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });

  return Boolean(adminMembership);
}

function isKioskLink(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000;
}

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const isAdmin = await ensureAdminForClub(req.user!.id, parsed.data.clubId);
  if (!isAdmin) {
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

router.post('/kiosk', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createKioskLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const isAdmin = await ensureAdminForClub(req.user!.id, parsed.data.clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + KIOSK_LINK_MIN_HOURS * 60 * 60 * 1000);

  const link = await prisma.signInLink.create({
    data: {
      clubId: parsed.data.clubId,
      cryptoToken: token,
      expiresAt,
    },
  });

  res.status(201).json(link);
});

router.get('/club/:clubId', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const links = await prisma.signInLink.findMany({
    where: {
      clubId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    links.map(link => ({
      ...link,
      mode: isKioskLink(link.expiresAt) ? 'KIOSK' : 'QR',
    }))
  );
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const link = await prisma.signInLink.findUnique({ where: { id } });
  if (!link) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  const isAdmin = await ensureAdminForClub(req.user!.id, link.clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await prisma.signInLink.delete({ where: { id } });
  res.status(204).send();
});

router.post('/:token/issue', async (req: AuthRequest, res: Response) => {
  const parsed = issueQrSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const kioskToken = req.params.token as string;
  const kioskLink = await prisma.signInLink.findUnique({
    where: { cryptoToken: kioskToken },
  });

  if (!kioskLink) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (kioskLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  if (!isKioskLink(kioskLink.expiresAt)) {
    res.status(400).json({ error: 'Only kiosk links can issue QR sign-in tokens' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + parsed.data.expiresInMinutes * 60 * 1000);

  const issued = await prisma.signInLink.create({
    data: {
      clubId: kioskLink.clubId,
      cryptoToken: token,
      expiresAt,
    },
  });

  res.status(201).json({
    id: issued.id,
    cryptoToken: issued.cryptoToken,
    expiresAt: issued.expiresAt,
    mode: 'QR',
  });
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
    auditSignInLinkInvalid(req.ip, 'not_found');
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (link.expiresAt < new Date()) {
    auditSignInLinkInvalid(req.ip, 'expired');
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  const accessToken = jwt.sign(
    {
      signInLinkId: link.id,
      clubId: link.clubId,
      tokenType: 'sign-in-access',
    },
    jwtSecret,
    { expiresIn: `${JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES}m` }
  );

  res.json({
    ...link,
    mode: isKioskLink(link.expiresAt) ? 'KIOSK' : 'QR',
    isAuthenticated: Boolean(req.user?.id),
    accessToken,
    accessTokenExpiresInMinutes: JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES,
  });
});

export default router;
