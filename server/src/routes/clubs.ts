import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, MembershipRole, OwnerType, Role } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import {
  auditFirearmDeleteDenied,
  auditMemberStatusChange,
  auditMemberRoleChange,
} from '../middleware/auditLog';

const router = Router();

const publicClubProfileParamsSchema = z.object({
  id: z.string().min(1),
});

router.get('/profile/:id', async (req, res: Response) => {
  const params = publicClubProfileParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const club = await prisma.club.findUnique({
    where: { id: params.data.id },
    select: {
      id: true,
      name: true,
      homeOfficeRef: true,
      address: true,
      disciplinesOffered: true,
      acceptingNewMembers: true,
      openingTimes: true,
      description: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
  });

  if (!club) {
    res.status(404).json({ error: 'Club not found' });
    return;
  }

  res.json(club);
});

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
  address: z.string().optional(),
  disciplinesOffered: z.array(z.string().min(1)).optional(),
  acceptingNewMembers: z.boolean().optional(),
  openingTimes: z.string().optional(),
  description: z.string().optional(),
});

const updateClubSchema = z.object({
  name: z.string().min(2).optional(),
  homeOfficeRef: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  disciplinesOffered: z.array(z.string().min(1)).optional().nullable(),
  acceptingNewMembers: z.boolean().optional(),
  openingTimes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDisciplines(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  value.forEach(item => {
    const normalized = item.trim();
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  });

  return Array.from(deduped);
}

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const disciplinesOffered = normalizeDisciplines(parsed.data.disciplinesOffered);

  const club = await prisma.club.create({
    data: {
      name: parsed.data.name,
      homeOfficeRef: normalizeOptionalText(parsed.data.homeOfficeRef),
      address: normalizeOptionalText(parsed.data.address),
      disciplinesOffered,
      acceptingNewMembers: parsed.data.acceptingNewMembers ?? true,
      openingTimes: normalizeOptionalText(parsed.data.openingTimes),
      description: normalizeOptionalText(parsed.data.description),
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

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateClubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    name?: string;
    homeOfficeRef?: string | null;
    address?: string | null;
    disciplinesOffered?: string[];
    acceptingNewMembers?: boolean;
    openingTimes?: string | null;
    description?: string | null;
  } = {};

  if ('name' in parsed.data && typeof parsed.data.name === 'string') {
    updateData.name = parsed.data.name;
  }
  if ('homeOfficeRef' in parsed.data) {
    updateData.homeOfficeRef = normalizeOptionalText(parsed.data.homeOfficeRef);
  }
  if ('address' in parsed.data) {
    updateData.address = normalizeOptionalText(parsed.data.address);
  }
  if ('disciplinesOffered' in parsed.data) {
    updateData.disciplinesOffered = normalizeDisciplines(parsed.data.disciplinesOffered);
  }
  if ('acceptingNewMembers' in parsed.data && typeof parsed.data.acceptingNewMembers === 'boolean') {
    updateData.acceptingNewMembers = parsed.data.acceptingNewMembers;
  }
  if ('openingTimes' in parsed.data) {
    updateData.openingTimes = normalizeOptionalText(parsed.data.openingTimes);
  }
  if ('description' in parsed.data) {
    updateData.description = normalizeOptionalText(parsed.data.description);
  }

  const club = await prisma.club.update({
    where: { id: clubId },
    data: updateData,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { memberships: true } },
    },
  });

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
          firearmCertificateNumber: true,
          firearmCertificateExpiry: true,
          shotgunCertificateNumber: true,
          shotgunCertificateExpiry: true,
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

  if (status) {
    auditMemberStatusChange(req.ip, req.user!.id, clubId, targetUserId, status);
  }
  if (role) {
    auditMemberRoleChange(req.ip, req.user!.id, clubId, targetUserId, role);
  }

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
  // Verify the firearm actually belongs to this club before deleting.
  // Without this check an admin of one club could delete a firearm owned by
  // another club by supplying a foreign firearmId in the URL.
  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, clubId, ownerType: OwnerType.CLUB },
  });
  if (!firearm) {
    auditFirearmDeleteDenied(req.ip, req.user!.id, clubId, firearmId);
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }
  await prisma.firearm.delete({ where: { id: firearmId } });
  res.status(204).send();
});

// Club Settings endpoints for Google Wallet
const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format').optional();

const updateClubSettingsSchema = z.object({
  logoUrl: z.string().url('Invalid URL').optional().nullable(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  passIssuingEnabled: z.boolean().optional(),
  memberCardSignInEnabled: z.boolean().optional(),
});

router.get('/:id/settings', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  let settings = await prisma.clubSettings.findUnique({
    where: { clubId },
  });

  if (!settings) {
    // Create default settings if they don't exist
    settings = await prisma.clubSettings.create({
      data: {
        clubId,
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        accentColor: '#3b82f6',
        passIssuingEnabled: false,
        memberCardSignInEnabled: false,
      },
    });
  }

  res.json(settings);
});

router.post('/:id/settings', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateClubSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const updateData: {
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    passIssuingEnabled?: boolean;
    memberCardSignInEnabled?: boolean;
  } = {};

  if ('logoUrl' in parsed.data) {
    updateData.logoUrl = parsed.data.logoUrl ? normalizeOptionalText(parsed.data.logoUrl) : null;
  }
  if ('primaryColor' in parsed.data && parsed.data.primaryColor) {
    updateData.primaryColor = parsed.data.primaryColor;
  }
  if ('secondaryColor' in parsed.data && parsed.data.secondaryColor) {
    updateData.secondaryColor = parsed.data.secondaryColor;
  }
  if ('accentColor' in parsed.data && parsed.data.accentColor) {
    updateData.accentColor = parsed.data.accentColor;
  }
  if ('passIssuingEnabled' in parsed.data && typeof parsed.data.passIssuingEnabled === 'boolean') {
    updateData.passIssuingEnabled = parsed.data.passIssuingEnabled;
  }
  if ('memberCardSignInEnabled' in parsed.data && typeof parsed.data.memberCardSignInEnabled === 'boolean') {
    updateData.memberCardSignInEnabled = parsed.data.memberCardSignInEnabled;
  }

  let settings = await prisma.clubSettings.findUnique({
    where: { clubId },
  });

  if (!settings) {
    settings = await prisma.clubSettings.create({
      data: {
        clubId,
        ...updateData,
      },
    });
  } else {
    settings = await prisma.clubSettings.update({
      where: { clubId },
      data: updateData,
    });
  }

  res.json(settings);
});

export default router;
