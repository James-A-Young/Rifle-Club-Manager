import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { BackupDataset, GoogleDriveConnectionStatus, MembershipStatus, MembershipRole, OwnerType } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import {
  auditFirearmDeleteDenied,
  auditMemberStatusChange,
  auditMemberRoleChange,
} from '../middleware/auditLog';
import { emailService } from '../services/email';
import { ensureAdminForClub } from '../utils/clubAccess';
import { decryptSecret, encryptSecret } from '../services/backups/crypto';
import {
  assertGoogleDriveOAuthConfigured,
  buildGoogleDriveAuthUrl,
  exchangeGoogleOAuthCode,
  revokeGoogleToken,
} from '../services/backups/googleDriveOAuth';
import { GoogleDriveBackupClient } from '../services/backups/googleDriveClient';
import { buildMemberDemographicsCsv } from '../services/exports/memberDemographicsExport';
import { getUserProfileHistorySince } from '../services/profileHistory';
import { deriveDeclarationStatusFromDueDate } from '../services/section21Declaration';

const router = Router();

const DRIVE_FOLDER_NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const driveFolderNameCache = new Map<string, { name: string; expiresAt: number }>();

function getCachedDriveFolderName(folderId: string): string | null {
  const cached = driveFolderNameCache.get(folderId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    driveFolderNameCache.delete(folderId);
    return null;
  }
  return cached.name;
}

function setCachedDriveFolderName(folderId: string, name: string): void {
  driveFolderNameCache.set(folderId, {
    name,
    expiresAt: Date.now() + DRIVE_FOLDER_NAME_CACHE_TTL_MS,
  });
}

const publicClubProfileParamsSchema = z.object({
  id: z.string().min(1),
});

const invitePreviewParamsSchema = z.object({
  token: z.string().min(1),
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

router.get('/invite-preview/:token', async (req, res: Response) => {
  const params = invitePreviewParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }

  const invite = await prisma.clubInvite.findUnique({
    where: { token: params.data.token },
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

  res.json({
    token: invite.token,
    expiresAt: invite.expiresAt,
    club: invite.club,
  });
});

router.use(requireAuth);

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
          approvedAt: new Date(),
        },
      },
    },
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
          section21Declarations: {
            orderBy: { signedDate: 'desc' },
            take: 1,
            select: {
              nextDueDate: true,
            },
          },
        },
      },
    },
  });

  const now = new Date();
  const withSection21Status = members.map(member => {
    const { section21Declarations, ...userWithoutDeclarations } = member.user;
    const latestDeclaration = section21Declarations[0];
    let section21Status: 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED' = 'NOT_DECLARED';

    if (latestDeclaration) {
      section21Status = deriveDeclarationStatusFromDueDate(latestDeclaration.nextDueDate, now);
    }

    return {
      ...member,
      user: userWithoutDeclarations,
      section21Status,
    };
  });

  res.json(withSection21Status);
});

router.get('/:id/members/export.csv', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const csv = await buildMemberDemographicsCsv(clubId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-members.csv"`);
  res.send(csv);
});

router.get('/:id/members/:userId/profile-history', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const membership = await prisma.clubMembership.findUnique({
    where: {
      userId_clubId: {
        userId: targetUserId,
        clubId,
      },
    },
    select: {
      approvedAt: true,
    },
  });

  if (!membership) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  if (!membership.approvedAt) {
    res.json([]);
    return;
  }

  const history = await getUserProfileHistorySince({
    userId: targetUserId,
    since: membership.approvedAt,
  });

  res.json(history);
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
    if (existing.status === MembershipStatus.INACTIVE) {
      const membership = await prisma.clubMembership.update({
        where: { userId_clubId: { userId: req.user!.id, clubId } },
        data: {
          status: MembershipStatus.PENDING,
          role: MembershipRole.MEMBER,
        },
      });
      res.status(201).json(membership);
      return;
    }
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
  role: z.enum(['MEMBER', 'ADMIN', 'PROBATIONARY_MEMBER', 'JUNIOR']).default('MEMBER'),
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

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  const emailSent = await emailService.sendInviteEmail({
    to: invite.email,
    clubName: club?.name ?? 'our club',
    role: invite.role,
    inviteToken: invite.token,
  });

  res.status(201).json({ ...invite, emailSent });
});

router.post('/:id/invites/:inviteId/send', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const inviteId = req.params.inviteId as string;

  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invite = await prisma.clubInvite.findFirst({
    where: {
      id: inviteId,
      clubId,
    },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      redeemedAt: true,
      expiresAt: true,
    },
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

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  const emailSent = await emailService.sendInviteEmail({
    to: invite.email,
    clubName: club?.name ?? 'our club',
    role: invite.role,
    inviteToken: invite.token,
  });

  res.json({
    success: true,
    emailSent,
    message: emailSent
      ? 'Invite email sent.'
      : 'Invite was found, but email sending is disabled or failed.',
  });
});

router.delete('/:id/invites/:inviteId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const inviteId = req.params.inviteId as string;

  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invite = await prisma.clubInvite.findFirst({
    where: {
      id: inviteId,
      clubId,
    },
    select: {
      id: true,
      redeemedAt: true,
    },
  });

  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  if (invite.redeemedAt) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }

  const deleted = await prisma.clubInvite.deleteMany({
    where: {
      id: inviteId,
      clubId,
      redeemedAt: null,
    },
  });

  if (deleted.count !== 1) {
    res.status(409).json({ error: 'Invite already redeemed' });
    return;
  }

  res.status(204).send();
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
  role: z.enum(['MEMBER', 'ADMIN', 'PROBATIONARY_MEMBER', 'JUNIOR']).optional(),
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

  const existingMembership = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    select: { role: true, status: true, approvedAt: true },
  });
  if (!existingMembership) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }

  // Validate: cannot demote the last admin
  if (role && role !== MembershipRole.ADMIN) {
    if (existingMembership.role === MembershipRole.ADMIN) {
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

  const updateData: {
    status?: MembershipStatus;
    role?: MembershipRole;
    approvedAt?: Date;
  } = {};

  if (status) {
    updateData.status = status;
    if (status === MembershipStatus.APPROVED && !existingMembership.approvedAt) {
      updateData.approvedAt = new Date();
    }
  }
  if (role) {
    updateData.role = role;
  }

  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: updateData,
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

router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const adminUserId = req.user!.id;
  const isAdmin = await ensureAdminForClub(adminUserId, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (targetUserId === adminUserId) {
    res.status(409).json({ error: 'You cannot remove yourself from the club' });
    return;
  }

  const targetMember = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!targetMember) {
    res.status(404).json({ error: 'Membership not found' });
    return;
  }
  if (targetMember.status === MembershipStatus.INACTIVE) {
    res.status(200).json(targetMember);
    return;
  }

  if (targetMember.role === MembershipRole.ADMIN && targetMember.status === MembershipStatus.APPROVED) {
    const adminCount = await prisma.clubMembership.count({
      where: {
        clubId,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.APPROVED,
      },
    });
    if (adminCount === 1) {
      res.status(409).json({ error: 'Cannot remove the last approved admin of the club' });
      return;
    }
  }

  const updated = await prisma.clubMembership.update({
    where: { userId_clubId: { userId: targetUserId, clubId } },
    data: { status: MembershipStatus.INACTIVE },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  auditMemberStatusChange(req.ip, adminUserId, clubId, targetUserId, MembershipStatus.INACTIVE);
  res.json(updated);
});

const firearmSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().min(1),
  serialNumber: z.string().min(1),
});
router.get('/:id/firearms', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const firearms = await prisma.firearm.findMany({
    where: { clubId, ownerType: OwnerType.CLUB },
  });
  res.json(firearms);
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

router.patch('/:id/firearms/:firearmId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const firearmId = req.params.firearmId as string;
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

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, clubId, ownerType: OwnerType.CLUB },
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

// Club Settings endpoints for Google Wallet
const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color format').optional();

const updateClubSettingsSchema = z.object({
  logoUrl: z.string().url('Invalid URL').optional().nullable(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  passIssuingEnabled: z.boolean().optional(),
  memberCardSignInEnabled: z.boolean().optional(),
  backupEnabled: z.boolean().optional(),
  ammoSalesLookbackDays: z.number().int().min(1).max(365).optional(),
  ammoDefaultLeadTimeDays: z.number().int().min(1).max(365).optional(),
  ammoDefaultSafetyStockDays: z.number().int().min(0).max(365).optional(),
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
        backupEnabled: false,
        ammoSalesLookbackDays: 30,
        ammoDefaultLeadTimeDays: 14,
        ammoDefaultSafetyStockDays: 7,
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
    backupEnabled?: boolean;
    ammoSalesLookbackDays?: number;
    ammoDefaultLeadTimeDays?: number;
    ammoDefaultSafetyStockDays?: number;
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
  if ('backupEnabled' in parsed.data && typeof parsed.data.backupEnabled === 'boolean') {
    updateData.backupEnabled = parsed.data.backupEnabled;
  }
  if ('ammoSalesLookbackDays' in parsed.data && typeof parsed.data.ammoSalesLookbackDays === 'number') {
    updateData.ammoSalesLookbackDays = parsed.data.ammoSalesLookbackDays;
  }
  if ('ammoDefaultLeadTimeDays' in parsed.data && typeof parsed.data.ammoDefaultLeadTimeDays === 'number') {
    updateData.ammoDefaultLeadTimeDays = parsed.data.ammoDefaultLeadTimeDays;
  }
  if ('ammoDefaultSafetyStockDays' in parsed.data && typeof parsed.data.ammoDefaultSafetyStockDays === 'number') {
    updateData.ammoDefaultSafetyStockDays = parsed.data.ammoDefaultSafetyStockDays;
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

const backupOAuthStartSchema = z.object({
  driveFolderId: z.string().min(1).optional(),
});

const backupFolderListQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
});

const backupFolderSelectSchema = z.object({
  driveFolderId: z.string().min(1),
});

router.get('/:id/settings/backups/google-drive/status', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [settings, connection, latestRuns] = await Promise.all([
    prisma.clubSettings.findUnique({ where: { clubId }, select: { backupEnabled: true } }),
    prisma.googleDriveConnection.findUnique({
      where: { clubId },
      select: {
        status: true,
        driveFolderId: true,
        encryptedRefreshToken: true,
        tokenIv: true,
        tokenAuthTag: true,
        linkedAt: true,
        disconnectedAt: true,
        updatedAt: true,
      },
    }),
    prisma.backupRun.findMany({
      where: { clubId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        dataset: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
      },
    }),
  ]);

  const latestByDataset = Object.values(BackupDataset).reduce<Record<string, {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    error: string | null;
  } | null>>((acc, dataset) => {
    const run = latestRuns.find(r => r.dataset === dataset) ?? null;
    acc[dataset] = run ? {
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error ?? null,
    } : null;
    return acc;
  }, {});

  let driveFolderName: string | null = null;
  if (connection?.driveFolderId
    && connection.status === GoogleDriveConnectionStatus.ACTIVE
    && connection.encryptedRefreshToken
    && connection.tokenIv
    && connection.tokenAuthTag) {
    driveFolderName = getCachedDriveFolderName(connection.driveFolderId);
    if (!driveFolderName) {
      try {
        const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
        const drive = new GoogleDriveBackupClient(refreshToken);
        const folder = await drive.getFolderMetadata(connection.driveFolderId);
        driveFolderName = folder?.name ?? null;
        if (folder?.name) {
          setCachedDriveFolderName(connection.driveFolderId, folder.name);
        }
      } catch {
        driveFolderName = null;
      }
    }
  }

  res.json({
    backupEnabled: settings?.backupEnabled ?? false,
    connection: connection
      ? {
          linked: connection.status === GoogleDriveConnectionStatus.ACTIVE,
          status: connection.status,
          driveFolderId: connection.driveFolderId,
          driveFolderName,
          linkedAt: connection.linkedAt,
          disconnectedAt: connection.disconnectedAt,
          updatedAt: connection.updatedAt,
        }
      : {
          linked: false,
          status: 'NONE',
          driveFolderId: null,
          driveFolderName: null,
          linkedAt: null,
          disconnectedAt: null,
          updatedAt: null,
        },
    latestByDataset,
  });
});

router.post('/:id/settings/backups/google-drive/link/start', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    assertGoogleDriveOAuthConfigured();
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'Google Drive OAuth is not configured' });
    return;
  }

  const parsed = backupOAuthStartSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.googleDriveOAuthState.create({
    data: {
      state,
      clubId,
      userId: req.user!.id,
      nonce,
      expiresAt,
    },
  });

  if (parsed.data.driveFolderId) {
    await prisma.googleDriveConnection.upsert({
      where: { clubId },
      create: {
        clubId,
        linkedByUserId: req.user!.id,
        status: GoogleDriveConnectionStatus.DISCONNECTED,
        driveFolderId: parsed.data.driveFolderId.trim(),
        encryptedRefreshToken: '',
        tokenIv: '',
        tokenAuthTag: '',
      },
      update: {
        driveFolderId: parsed.data.driveFolderId.trim(),
      },
    });
  }

  res.json({
    authUrl: buildGoogleDriveAuthUrl(state),
    expiresAt,
  });
});

router.get('/:id/settings/backups/google-drive/folders', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = backupFolderListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({
    where: { clubId },
    select: {
      status: true,
      encryptedRefreshToken: true,
      tokenIv: true,
      tokenAuthTag: true,
    },
  });

  if (!connection || connection.status !== GoogleDriveConnectionStatus.ACTIVE) {
    res.status(400).json({ error: 'Link Google Drive before browsing folders' });
    return;
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
  const drive = new GoogleDriveBackupClient(refreshToken);
  const parentId = parsed.data.parentId;
  const currentFolder = parentId ? await drive.getFolderMetadata(parentId) : null;

  if (parentId && !currentFolder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const folders = await drive.listFolders(parentId ?? 'root');
  res.json({
    currentFolder: currentFolder
      ? {
          id: currentFolder.id,
          name: currentFolder.name,
          parentId: currentFolder.parentId,
        }
      : null,
    folders,
  });
});

router.post('/:id/settings/backups/google-drive/folder', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = backupFolderSelectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({
    where: { clubId },
    select: {
      status: true,
      encryptedRefreshToken: true,
      tokenIv: true,
      tokenAuthTag: true,
    },
  });

  if (!connection || connection.status !== GoogleDriveConnectionStatus.ACTIVE) {
    res.status(400).json({ error: 'Link Google Drive before selecting a folder' });
    return;
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
  const drive = new GoogleDriveBackupClient(refreshToken);
  const folder = await drive.getFolderMetadata(parsed.data.driveFolderId);
  if (!folder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  await prisma.googleDriveConnection.update({
    where: { clubId },
    data: { driveFolderId: folder.id },
  });

  setCachedDriveFolderName(folder.id, folder.name);

  res.json({
    driveFolderId: folder.id,
    folderName: folder.name,
  });
});

router.get('/settings/backups/google-drive/callback', async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!state || !code) {
    res.status(400).json({ error: 'Missing OAuth state or code' });
    return;
  }

  const oauthState = await prisma.googleDriveOAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.userId !== req.user.id) {
    res.status(400).json({ error: 'Invalid OAuth state' });
    return;
  }
  if (oauthState.consumedAt || oauthState.expiresAt < new Date()) {
    res.status(400).json({ error: 'OAuth state expired or already used' });
    return;
  }

  let refreshToken: string;
  let scope: string | undefined;
  let expiryDate: Date | undefined;
  try {
    const exchanged = await exchangeGoogleOAuthCode(code);
    refreshToken = exchanged.refreshToken;
    scope = exchanged.scope;
    expiryDate = exchanged.expiryDate;
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to complete OAuth exchange' });
    return;
  }

  const encrypted = encryptSecret(refreshToken);
  const existingConnection = await prisma.googleDriveConnection.findUnique({
    where: { clubId: oauthState.clubId },
    select: { driveFolderId: true },
  });

  await prisma.$transaction([
    prisma.googleDriveOAuthState.update({
      where: { state: oauthState.state },
      data: { consumedAt: new Date() },
    }),
    prisma.googleDriveConnection.upsert({
      where: { clubId: oauthState.clubId },
      create: {
        clubId: oauthState.clubId,
        linkedByUserId: req.user.id,
        status: GoogleDriveConnectionStatus.ACTIVE,
        driveFolderId: existingConnection?.driveFolderId ?? null,
        encryptedRefreshToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenScope: scope,
        tokenExpiry: expiryDate,
        linkedAt: new Date(),
        disconnectedAt: null,
      },
      update: {
        linkedByUserId: req.user.id,
        status: GoogleDriveConnectionStatus.ACTIVE,
        encryptedRefreshToken: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenScope: scope,
        tokenExpiry: expiryDate,
        linkedAt: new Date(),
        disconnectedAt: null,
      },
    }),
  ]);

  const origin = process.env.CLIENT_ORIGIN?.trim();
  if (origin) {
    res.redirect(`${origin}/clubs/${oauthState.clubId}?backupDriveLinked=1`);
    return;
  }

  res.json({ success: true, clubId: oauthState.clubId });
});

router.post('/:id/settings/backups/google-drive/disconnect', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.id as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const connection = await prisma.googleDriveConnection.findUnique({ where: { clubId } });
  if (!connection) {
    res.status(404).json({ error: 'Google Drive connection not found' });
    return;
  }

  if (connection.encryptedRefreshToken && connection.tokenIv && connection.tokenAuthTag) {
    try {
      const token = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
      await revokeGoogleToken(token);
    } catch {
      // best effort revoke; continue to disconnect locally
    }
  }

  await prisma.$transaction([
    prisma.googleDriveConnection.update({
      where: { clubId },
      data: {
        status: GoogleDriveConnectionStatus.DISCONNECTED,
        disconnectedAt: new Date(),
      },
    }),
    prisma.clubSettings.upsert({
      where: { clubId },
      create: {
        clubId,
        backupEnabled: false,
      },
      update: {
        backupEnabled: false,
      },
    }),
  ]);

  res.json({ success: true });
});

export default router;
