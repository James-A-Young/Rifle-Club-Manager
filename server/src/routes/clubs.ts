import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole, OwnerType, Role } from '@prisma/client';
import { formatZodError } from '../utils/zodError';

const router = Router();

router.use(requireAuth);

async function ensureAdminForClub(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      clubId,
      userId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });
  return Boolean(membership);
}

const createClubSchema = z.object({
  name: z.string().min(2),
  homeOfficeRef: z.string().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
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
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const members = await prisma.clubMembership.findMany({
    where: { clubId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          address: true,
          placeOfBirth: true,
          dateOfBirth: true,
          gdprConsentDate: true,
        },
      },
    },
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

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['MEMBER', 'ADMIN']).default('MEMBER'),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

router.post('/:id/invites', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const invite = await prisma.clubInvite.create({
    data: {
      clubId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000),
      createdByUserId: req.user!.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.status(201).json(invite);
});

router.get('/:id/invites', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invites = await prisma.clubInvite.findMany({
    where: { clubId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      redeemedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(invites);
});

router.get('/invites/:token', async (req: AuthRequest, res: Response) => {
  const token = req.params.token as string;
  const invite = await prisma.clubInvite.findUnique({
    where: { token },
    include: { club: { select: { id: true, name: true } } },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }
  if (invite.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invite expired' });
    return;
  }
  if (req.user!.email.toLowerCase() !== invite.email.toLowerCase()) {
    res.status(403).json({ error: 'Invite email does not match your account' });
    return;
  }

  res.json({
    id: invite.id,
    token: invite.token,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    club: invite.club,
  });
});

router.post('/invites/:token/accept', async (req: AuthRequest, res: Response) => {
  const token = req.params.token as string;

  try {
    const membership = await prisma.$transaction(async tx => {
      const invite = await tx.clubInvite.findUnique({ where: { token } });
      if (!invite) {
        throw new Error('INVITE_NOT_FOUND');
      }
      if (invite.redeemedAt) {
        throw new Error('INVITE_REDEEMED');
      }
      if (invite.expiresAt < new Date()) {
        throw new Error('INVITE_EXPIRED');
      }
      if (req.user!.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new Error('INVITE_EMAIL_MISMATCH');
      }

      const existing = await tx.clubMembership.findUnique({
        where: {
          userId_clubId: {
            userId: req.user!.id,
            clubId: invite.clubId,
          },
        },
      });

      if (existing?.status === MembershipStatus.APPROVED) {
        throw new Error('ALREADY_MEMBER');
      }

      const savedMembership = existing
        ? await tx.clubMembership.update({
            where: {
              userId_clubId: {
                userId: req.user!.id,
                clubId: invite.clubId,
              },
            },
            data: {
              role: invite.role,
              status: MembershipStatus.PENDING,
            },
          })
        : await tx.clubMembership.create({
            data: {
              userId: req.user!.id,
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
          redeemedByUserId: req.user!.id,
        },
      });

      if (markRedeemed.count !== 1) {
        throw new Error('INVITE_REDEEMED');
      }

      return savedMembership;
    });

    res.json({
      success: true,
      message: 'Invite accepted. Your membership is pending admin approval.',
      membership,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'INVITE_ACCEPT_FAILED';
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
      res.status(403).json({ error: 'Invite email does not match your account' });
      return;
    }
    if (message === 'ALREADY_MEMBER') {
      res.status(409).json({ error: 'You are already an approved member of this club' });
      return;
    }

    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

const updateMemberSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']).optional(),
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
});

router.patch('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { status, role } = parsed.data;
  if (!status && !role) {
    res.status(400).json({ error: 'Must provide status or role to update' });
    return;
  }

  // Validate: cannot demote the last admin
  if (role === MembershipRole.MEMBER) {
    const targetMember = await prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: targetUserId, clubId } },
    });
    if (targetMember?.role === MembershipRole.ADMIN) {
      const adminCount = await prisma.clubMembership.count({
        where: {
          clubId,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.APPROVED,
        },
      });
      if (adminCount === 1) {
        res.status(409).json({ error: 'Cannot demote the last admin of the club' });
        return;
      }
    }
  }

  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: { ...(status && { status }), ...(role && { role }) },
    include: { user: { select: { id: true, name: true, email: true } } },
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
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
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
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await prisma.firearm.delete({ where: { id: firearmId } });
  res.status(204).send();
});

export default router;
