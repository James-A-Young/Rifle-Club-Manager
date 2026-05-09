import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { OwnerType } from '@prisma/client';
import { formatZodError } from '../utils/zodError';

const router = Router();

router.use(requireAuth);

router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
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

router.patch('/me', async (req: AuthRequest, res: Response) => {
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
      role: true,
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

router.get('/me/firearms', async (req: AuthRequest, res: Response) => {
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

router.post('/me/firearms', async (req: AuthRequest, res: Response) => {
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

router.delete('/me/firearms/:id', async (req: AuthRequest, res: Response) => {
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

export default router;
