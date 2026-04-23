import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole, OwnerType, Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

const createClubSchema = z.object({
  name: z.string().min(2),
  homeOfficeRef: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const club = await prisma.club.create({
    data: {
      ...parsed.data,
      ownerId: req.user!.id,
      memberships: {
        create: {
          userId: req.user!.id,
          status: MembershipStatus.APPROVED,
          role: MembershipRole.ADMIN,
        },
      },
    },
  });

  await prisma.user.update({
    where: { id: req.user!.id },
    data: { role: Role.OWNER },
  });

  res.status(201).json(club);
});

router.get('/', async (_req: AuthRequest, res: Response) => {
  const clubs = await prisma.club.findMany({
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  res.json(clubs);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { memberships: true } },
    },
  });
  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  res.json(club);
});

router.get('/:id/members', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const membership = await prisma.clubMembership.findFirst({
    where: {
      clubId,
      userId: req.user!.id,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });
  if (!membership) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const members = await prisma.clubMembership.findMany({
    where: { clubId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(members);
});

router.post('/:id/join', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }
  const existing = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: req.user!.id, clubId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Already a member or request pending' });
    return;
  }
  const membership = await prisma.clubMembership.create({
    data: {
      userId: req.user!.id,
      clubId,
      status: MembershipStatus.PENDING,
      role: MembershipRole.MEMBER,
    },
  });
  res.status(201).json(membership);
});

const updateMemberSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
});

router.patch('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
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
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: parsed.data,
  });
  res.json(updated);
});

const firearmSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().min(1),
  serialNumber: z.string().min(1),
});

router.post('/:id/firearms', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
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
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const firearm = await prisma.firearm.create({
    data: {
      ...parsed.data,
      ownerType: OwnerType.CLUB,
      clubId,
    },
  });
  res.status(201).json(firearm);
});

router.delete('/:id/firearms/:firearmId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const firearmId = req.params.firearmId as string;
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
  await prisma.firearm.delete({ where: { id: firearmId } });
  res.status(204).send();
});

export default router;
