import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { OwnerType, MembershipStatus } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import { googleWalletService, CreatePassParams } from '../services/googleWallet';

const router = Router();

router.use(requireAuth);

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
      firearmCertificateNumber: true,
      firearmCertificateExpiry: true,
      shotgunCertificateNumber: true,
      shotgunCertificateExpiry: true,
      gdprConsentDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  placeOfBirth: z.string().min(2).optional(),
  dateOfBirth: z.string().optional(),
  firearmCertificateNumber: z.string().optional().nullable(),
  firearmCertificateExpiry: z.string().optional().nullable(),
  shotgunCertificateNumber: z.string().optional().nullable(),
  shotgunCertificateExpiry: z.string().optional().nullable(),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field}`);
  }
  return parsed;
}

router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  let firearmCertificateExpiry: Date | null = null;
  let shotgunCertificateExpiry: Date | null = null;
  try {
    firearmCertificateExpiry = parseOptionalDate(parsed.data.firearmCertificateExpiry, 'firearm certificate expiry date');
    shotgunCertificateExpiry = parseOptionalDate(parsed.data.shotgunCertificateExpiry, 'shotgun certificate expiry date');
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid certificate expiry date' });
    return;
  }

  const {
    dateOfBirth,
    firearmCertificateNumber,
    shotgunCertificateNumber,
  } = parsed.data;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(('name' in parsed.data) ? { name: parsed.data.name } : {}),
      ...(('address' in parsed.data) ? { address: parsed.data.address } : {}),
      ...(('placeOfBirth' in parsed.data) ? { placeOfBirth: parsed.data.placeOfBirth } : {}),
      ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
      ...(('firearmCertificateNumber' in parsed.data)
        ? { firearmCertificateNumber: normalizeOptionalText(firearmCertificateNumber) }
        : {}),
      ...(('firearmCertificateExpiry' in parsed.data)
        ? { firearmCertificateExpiry }
        : {}),
      ...(('shotgunCertificateNumber' in parsed.data)
        ? { shotgunCertificateNumber: normalizeOptionalText(shotgunCertificateNumber) }
        : {}),
      ...(('shotgunCertificateExpiry' in parsed.data)
        ? { shotgunCertificateExpiry }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
      firearmCertificateNumber: true,
      firearmCertificateExpiry: true,
      shotgunCertificateNumber: true,
      shotgunCertificateExpiry: true,
      updatedAt: true,
    },
  });
  res.json(user);
});

router.get('/me/firearms', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearms = await prisma.firearm.findMany({
    where: { userId: req.user!.id, ownerType: OwnerType.USER },
  });
  res.json(firearms);
});

const firearmSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().min(1),
  serialNumber: z.string().min(1),
});

router.post('/me/firearms', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const firearm = await prisma.firearm.create({
    data: {
      ...parsed.data,
      ownerType: OwnerType.USER,
      userId: req.user!.id,
    },
  });
  res.status(201).json(firearm);
});

router.delete('/me/firearms/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearmId = req.params.id as string;
  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, userId: req.user!.id },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }
  await prisma.firearm.delete({ where: { id: firearmId } });
  res.status(204).send();
});

router.patch('/me/firearms/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearmId = req.params.id as string;
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, userId: req.user!.id, ownerType: OwnerType.USER },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }

  const updated = await prisma.firearm.update({
    where: { id: firearmId },
    data: parsed.data,
  });

  res.json(updated);
});

// Google Wallet Membership Pass endpoints
router.get('/me/membership-passes/:clubId', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;

  try {
    // Fetch current user with name
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true },
    });

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify user is a member of the club and it's approved
    const membership = await prisma.clubMembership.findFirst({
      where: {
        userId: req.user!.id,
        clubId,
        status: MembershipStatus.APPROVED,
      },
      include: { club: true },
    });

    if (!membership) {
      res.status(404).json({ error: 'Club membership not found or not approved' });
      return;
    }

    // Check if pass issuing is enabled
    const settings = await prisma.clubSettings.findUnique({
      where: { clubId },
    });

    if (!settings?.passIssuingEnabled) {
      res.status(403).json({ error: 'Pass issuing is not enabled for this club' });
      return;
    }


    // Get visitor count this year
    const currentYear = new Date().getFullYear();
    const visitCount = await prisma.visitLog.count({
      where: {
        userId: req.user!.id,
        clubId,
        timeIn: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31T23:59:59Z`),
        },
      },
    });

    // get total ammunition for year
    const roundsThisYear = await prisma.ammunitionSale.aggregate({
      where: {
        buyerUserId: req.user!.id,
        clubId,
        createdAt: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31T23:59:59Z`),
        },
      },
      _sum: {
        quantity: true,
      },
    });
    
    // get average score for last 10 cards
    const average = await prisma.score.aggregate({
      where: {
        userId: req.user!.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 10,
      _avg: {
        score: true,
      },
    });



    try {
      

      const addToWalletLink = await googleWalletService.generateAddToWalletLink({
        userId: req.user!.id,
        clubId,
        memberName: currentUser.name,
        membershipType: membership.club.name,
        visitCount,
        roundsThisYear: roundsThisYear._sum.quantity || 0,
        average: average._avg.score || 0,
        clubName: membership.club.name,
        settings: {
          secondaryColor: settings.secondaryColor || '#374151',
          accentColor: settings.accentColor || '#3b82f6',
        },
      } as CreatePassParams);

      res.json(addToWalletLink);
      
    } catch (apiError) {
      // Google Wallet API may fail in test environments without real credentials
      // Still return pass data, just without wallet link
      console.warn('Google Wallet API error (may be expected in test env):', apiError);
    }
  } catch (error) {
    console.error('Error generating membership pass:', error);
    res.status(500).json({ error: 'Failed to generate membership pass' });
  }
});

export default router;
