import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole } from '@prisma/client';

const router = Router();

router.use(requireAuth);

const createVisitSchema = z.object({
  clubId: z.string(),
  purpose: z.string().min(1),
  firearmUsedId: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId: req.user!.id,
      clubId: parsed.data.clubId,
      status: MembershipStatus.APPROVED,
    },
  });
  if (!membership) {
    res.status(403).json({ error: 'Not an approved member of this club' });
    return;
  }

  const visit = await prisma.visitLog.create({
    data: {
      userId: req.user!.id,
      clubId: parsed.data.clubId,
      purpose: parsed.data.purpose,
      firearmUsedId: parsed.data.firearmUsedId,
    },
  });
  res.status(201).json(visit);
});

router.patch('/:id/signout', async (req: AuthRequest, res: Response) => {
  const visitId = req.params.id as string;
  const visit = await prisma.visitLog.findFirst({
    where: { id: visitId, userId: req.user!.id },
  });
  if (!visit) {
    res.status(404).json({ error: 'Visit not found' });
    return;
  }
  if (visit.timeOut) {
    res.status(409).json({ error: 'Already signed out' });
    return;
  }
  const updated = await prisma.visitLog.update({
    where: { id: visitId },
    data: { timeOut: new Date() },
  });
  res.json(updated);
});

router.get('/mine', async (req: AuthRequest, res: Response) => {
  const visits = await prisma.visitLog.findMany({
    where: { userId: req.user!.id },
    include: {
      club: { select: { id: true, name: true } },
      firearmUsed: true,
    },
    orderBy: { timeIn: 'desc' },
  });
  res.json(visits);
});

router.get('/active', async (req: AuthRequest, res: Response) => {
  const visit = await prisma.visitLog.findFirst({
    where: { userId: req.user!.id, timeOut: null },
    include: {
      club: { select: { id: true, name: true } },
      firearmUsed: true,
    },
  });
  res.json(visit ?? null);
});

router.get('/club/:clubId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const adminMembership = await prisma.clubMembership.findFirst({
    where: {
      clubId,
      userId: req.user!.id,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });
  if (!adminMembership) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const visits = await prisma.visitLog.findMany({
    where: { clubId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: true,
    },
    orderBy: { timeIn: 'desc' },
  });
  res.json(visits);
});

export default router;
