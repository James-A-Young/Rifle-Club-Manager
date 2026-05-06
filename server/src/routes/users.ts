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
});

router.patch('/me', async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { dateOfBirth, ...rest } = parsed.data;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...rest,
      ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
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
