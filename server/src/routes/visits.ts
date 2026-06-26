import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest, attachOptionalAuth } from '../middleware/auth';
import { MembershipStatus, MembershipRole, OwnerType, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { formatZodError } from '../utils/zodError';
import { jwtSecret, JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES } from '../config/jwt';
import { auditFirearmLinkDenied, auditKioskSignIn } from '../middleware/auditLog';
import { ensureAdminForClub } from '../utils/clubAccess';
import { streamSignInHistoryCsv } from '../services/exports/signInHistoryExport';

const router = Router();

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
type TimeWindowPreset = '3m' | '6m' | '12m' | 'custom';

type HistoryFilters = {
  search?: string;
  memberId?: string;
  firearmId?: string;
  firearmSerial?: string;
  visitorType?: 'guest' | 'member';
  from?: Date;
  to?: Date;
};

type MemberSnapshot = {
  memberUserIdSnapshot: string;
  memberNameSnapshot: string;
  memberEmailSnapshot: string;
};

type FirearmSnapshot = {
  firearmSerialSnapshot: string;
  firearmMakeSnapshot: string;
  firearmModelSnapshot: string;
  firearmCaliberSnapshot: string;
};

type SignInAccessTokenPayload = {
  signInLinkId: string;
  clubId: string;
  tokenType: string;
};

type MemberCardSignInTokenPayload = {
  signInLinkId: string;
  clubId: string;
  userId: string;
  tokenType: string;
};

type MembershipCardIdentity = {
  clubId: string;
  userId: string;
};

async function fetchMemberSnapshot(userId: string): Promise<MemberSnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return null;
  }

  return {
    memberUserIdSnapshot: user.id,
    memberNameSnapshot: user.name,
    memberEmailSnapshot: user.email,
  };
}

function toFirearmSnapshot(firearm: {
  serialNumber: string;
  make: string;
  model: string;
  caliber: string;
}): FirearmSnapshot {
  return {
    firearmSerialSnapshot: firearm.serialNumber,
    firearmMakeSnapshot: firearm.make,
    firearmModelSnapshot: firearm.model,
    firearmCaliberSnapshot: firearm.caliber,
  };
}

async function fetchFirearmSnapshot(firearmId: string | undefined): Promise<FirearmSnapshot | null> {
  if (!firearmId) {
    return null;
  }

  const firearm = await prisma.firearm.findUnique({
    where: { id: firearmId },
    select: {
      serialNumber: true,
      make: true,
      model: true,
      caliber: true,
    },
  });

  if (!firearm) {
    return null;
  }

  return toFirearmSnapshot(firearm);
}

function isKioskLink(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000;
}

function verifySignInAccessToken(signInAccessToken: string): SignInAccessTokenPayload | null {
  try {
    const payload = jwt.verify(signInAccessToken, jwtSecret) as SignInAccessTokenPayload;
    if (
      payload.tokenType !== 'sign-in-access'
      || typeof payload.signInLinkId !== 'string'
      || typeof payload.clubId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function verifyMemberCardSignInToken(memberCardSignInToken: string): MemberCardSignInTokenPayload | null {
  try {
    const payload = jwt.verify(memberCardSignInToken, jwtSecret) as MemberCardSignInTokenPayload;
    if (
      payload.tokenType !== 'member-card-sign-in'
      || typeof payload.signInLinkId !== 'string'
      || typeof payload.clubId !== 'string'
      || typeof payload.userId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseMembershipCardQrData(qrData: string): MembershipCardIdentity | null {
  const legacyMatch = qrData.match(/^club:([^:]+):member:(.+)$/);
  if (legacyMatch) {
    return {
      clubId: legacyMatch[1],
      userId: legacyMatch[2],
    };
  }

  const walletMatch = qrData.match(/^membership:([^:]+):(.+)$/);
  if (walletMatch) {
    return {
      clubId: walletMatch[1],
      userId: walletMatch[2],
    };
  }

  return null;
}

async function resolveHistoricalSearchMemberIds(clubId: string, search: string): Promise<string[]> {
  if (!search) {
    return [];
  }

  const pattern = `%${search}%`;
  const rows = await prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    SELECT DISTINCT h."userId"
    FROM "UserProfileHistory" h
    INNER JOIN "ClubMembership" m
      ON m."userId" = h."userId"
    WHERE m."clubId" = ${clubId}
      AND CAST(h."changes" AS TEXT) ILIKE ${pattern}
  `);

  return rows.map(row => row.userId);
}

function isValidDateValue(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function parsePageSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

function parseCursor(cursorRaw: unknown): { timeIn: Date; id: string } | null {
  if (typeof cursorRaw !== 'string' || !cursorRaw.includes('|')) {
    return null;
  }

  const [timeRaw, id] = cursorRaw.split('|');
  const timeIn = new Date(timeRaw);
  if (!id || Number.isNaN(timeIn.getTime())) {
    return null;
  }

  return { timeIn, id };
}

function encodeCursor(value: { timeIn: Date; id: string }): string {
  return `${value.timeIn.toISOString()}|${value.id}`;
}

function parseTimeWindow(req: AuthRequest): { from?: Date; to?: Date } {
  const preset = (req.query.timeWindowPreset as TimeWindowPreset | undefined) ?? '3m';
  const now = new Date();

  if (preset === 'custom') {
    const from = isValidDateValue(req.query.from) ? new Date(req.query.from) : undefined;
    const to = isValidDateValue(req.query.to) ? new Date(req.query.to) : now;
    return { from, to };
  }

  if (preset === '6m') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()), to: now };
  }

  if (preset === '12m') {
    return { from: new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()), to: now };
  }

  return { from: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), to: now };
}

function parseHistoryFilters(req: AuthRequest): HistoryFilters {
  const { from, to } = parseTimeWindow(req);
  const visitorTypeRaw = typeof req.query.visitorType === 'string' ? req.query.visitorType.toLowerCase() : undefined;
  const visitorType = visitorTypeRaw === 'guest' || visitorTypeRaw === 'member' ? visitorTypeRaw : undefined;

  return {
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    memberId: typeof req.query.memberId === 'string' ? req.query.memberId : undefined,
    firearmId: typeof req.query.firearmId === 'string' ? req.query.firearmId : undefined,
    firearmSerial: typeof req.query.firearmSerial === 'string' ? req.query.firearmSerial.trim() : undefined,
    visitorType,
    from,
    to,
  };
}

function buildHistoryWhere(
  clubId: string,
  filters: HistoryFilters,
  searchMemberIds: string[] = []
): Prisma.VisitLogWhereInput {
  const andFilters: Prisma.VisitLogWhereInput[] = [{ clubId }];

  if (filters.from || filters.to) {
    andFilters.push({
      timeIn: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  if (filters.memberId) {
    andFilters.push({
      OR: [
        { userId: filters.memberId },
        { memberUserIdSnapshot: filters.memberId },
      ],
    });
  }

  if (filters.firearmId) {
    andFilters.push({ firearmUsedId: filters.firearmId });
  }

  if (filters.firearmSerial) {
    andFilters.push({
      OR: [
        {
          firearmUsed: {
            is: {
              serialNumber: {
                contains: filters.firearmSerial,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          firearmSerialSnapshot: {
            contains: filters.firearmSerial,
            mode: 'insensitive',
          },
        },
      ],
    });
  }

  if (filters.search) {
    andFilters.push({
      OR: [
        // Member search: in user name/email
        {
          user: {
            is: {
              name: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          user: {
            is: {
              email: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          memberNameSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          memberEmailSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        // Guest search: in guest name/email/club represented
        {
          guestName: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          guestEmail: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          guestClubRepresented: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          firearmUsed: {
            is: {
              serialNumber: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          firearmSerialSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          firearmMakeSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          firearmModelSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          firearmCaliberSnapshot: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        ...(searchMemberIds.length > 0
          ? [
              {
                userId: {
                  in: searchMemberIds,
                },
              },
              {
                memberUserIdSnapshot: {
                  in: searchMemberIds,
                },
              },
            ]
          : []),
      ],
    });
  }

  if (filters.visitorType === 'guest') {
    andFilters.push({
      memberUserIdSnapshot: null,
    });
  }

  if (filters.visitorType === 'member') {
    andFilters.push({
      memberUserIdSnapshot: { not: null },
    });
  }

  return { AND: andFilters };
}

function applyHistoryCursor(
  where: Prisma.VisitLogWhereInput,
  cursor: { timeIn: Date; id: string } | null
): Prisma.VisitLogWhereInput {
  if (!cursor) {
    return where;
  }

  return {
    AND: [
      where,
      {
        OR: [
          { timeIn: { lt: cursor.timeIn } },
          {
            AND: [
              { timeIn: cursor.timeIn },
              { id: { lt: cursor.id } },
            ],
          },
        ],
      },
    ],
  };
}

// Schema for public sign-in endpoint: explicitly excludes account/profile mutations
// - Intentionally does NOT accept: userDetails, name, email, address, dateOfBirth, placeOfBirth, password, etc.
// - This endpoint can only create visits and optionally add guest details or create firearms
// - User creation/modification must use /auth/register and /api/users/me respectively
const publicCreateVisitSchema = z.object({
  signInToken: z.string().min(1).optional(),
  signInAccessToken: z.string().min(1).optional(),
  purpose: z.string().min(1),
  firearmUsedId: z.string().optional(),
  firearmSerialNumber: z.string().trim().min(1).optional(),
  guestDetails: z.object({
    guestName: z.string().min(2),
    guestClubRepresented: z.string().min(1),
    guestEmail: z.string().email().optional(),
  }).optional(),
}).refine(data => Boolean(data.signInToken || data.signInAccessToken), {
  message: 'signInToken or signInAccessToken is required',
});

router.post('/public', attachOptionalAuth, async (req: AuthRequest, res: Response) => {
  // Reject if request contains account-like fields (defensive check)
  const forbiddenFields = ['userDetails', 'name', 'email', 'address', 'dateOfBirth', 'placeOfBirth', 'gdprConsent', 'password'];
  const providedKeys = Object.keys(req.body);
  const accountFieldsProvided = forbiddenFields.filter(f => providedKeys.includes(f));
  if (accountFieldsProvided.length > 0) {
    res.status(400).json({ error: `Account modification not allowed in sign-in endpoint. Rejected fields: ${accountFieldsProvided.join(', ')}` });
    return;
  }

  const parsed = publicCreateVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  let signInLinkId: string | undefined;
  let clubIdFromAccess: string | undefined;

  if (parsed.data.signInAccessToken) {
    const payload = verifySignInAccessToken(parsed.data.signInAccessToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired sign-in access token' });
      return;
    }
    signInLinkId = payload.signInLinkId;
    clubIdFromAccess = payload.clubId;
  }

  const signInLink = signInLinkId
    ? await prisma.signInLink.findUnique({
        where: { id: signInLinkId },
        include: {
          club: {
            include: {
              firearms: {
                where: { deletedAt: null },
              },
            },
          },
        },
      })
    : await prisma.signInLink.findUnique({
        where: { cryptoToken: parsed.data.signInToken },
        include: {
          club: {
            include: {
              firearms: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

  if (!signInLink) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (!parsed.data.signInAccessToken && signInLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  if (clubIdFromAccess && signInLink.clubId !== clubIdFromAccess) {
    res.status(401).json({ error: 'Invalid sign-in access token' });
    return;
  }

  // Determine if this is an authenticated user or guest visit
  const userId = req.user?.id;
  const isAuthenticatedUser = Boolean(userId);
  const clubId = signInLink.clubId;

  let firearmUsedId = parsed.data.firearmUsedId;

  // Validate that an explicitly provided firearmId belongs to this club or the user.
  if (firearmUsedId) {
    const ownedFirearm = await prisma.firearm.findFirst({
      where: {
        id: firearmUsedId,
        deletedAt: null,
        OR: [
          { clubId },
          ...(userId ? [{ userId, ownerType: OwnerType.USER }] : []),
        ],
      },
    });
    if (!ownedFirearm) {
      auditFirearmLinkDenied(req.ip, userId, clubId, firearmUsedId);
      res.status(400).json({ error: 'Firearm not found or does not belong to this club or user' });
      return;
    }
  }

  if (!firearmUsedId && parsed.data.firearmSerialNumber) {
    // Scope serial-number lookup to the club's own firearms and the
    // authenticated user's own firearms. Looking up globally would let a
    // visitor inadvertently (or deliberately) link a firearm from a
    // completely unrelated club/owner to a visit record.
    const existingFirearm = await prisma.firearm.findFirst({
      where: {
        serialNumber: parsed.data.firearmSerialNumber,
        deletedAt: null,
        OR: [
          { clubId, ownerType: OwnerType.CLUB },
          ...(userId ? [{ userId, ownerType: OwnerType.USER }] : []),
        ],
      },
    });

    if (existingFirearm) {
      firearmUsedId = existingFirearm.id;
    } else {
      // Only create firearm if authenticated (guests don't own firearms)
      if (isAuthenticatedUser) {
        const firearm = await prisma.firearm.create({
          data: {
            make: 'Unknown',
            model: 'Unknown',
            caliber: 'Unknown',
            serialNumber: parsed.data.firearmSerialNumber,
            ownerType: OwnerType.USER,
            userId,
          },
        });
        firearmUsedId = firearm.id;
      }
    }
  }

  // Create visit log
  const visitData: {
    clubId: string;
    purpose: string;
    firearmUsedId?: string;
    userId?: string | null;
    memberUserIdSnapshot?: string;
    memberNameSnapshot?: string;
    memberEmailSnapshot?: string;
    guestName?: string;
    guestClubRepresented?: string;
    guestEmail?: string | null;
    firearmSerialSnapshot?: string;
    firearmMakeSnapshot?: string;
    firearmModelSnapshot?: string;
    firearmCaliberSnapshot?: string;
  } = {
    clubId,
    purpose: parsed.data.purpose,
    firearmUsedId,
  };

  const firearmSnapshot = await fetchFirearmSnapshot(firearmUsedId);
  if (firearmSnapshot) {
    Object.assign(visitData, firearmSnapshot);
  }

  if (isAuthenticatedUser) {
    // Authenticated user: set userId only
    visitData.userId = userId;
    if (userId) {
      const memberSnapshot = await fetchMemberSnapshot(userId);
      if (memberSnapshot) {
        Object.assign(visitData, memberSnapshot);
      }
    }
  } else {
    // Guest visit: populate guest fields
    const guestDetails = parsed.data.guestDetails;
    if (!guestDetails) {
      res.status(400).json({ error: 'guestDetails are required for guest sign-in' });
      return;
    }
    visitData.userId = null;
    visitData.guestName = guestDetails.guestName;
    visitData.guestClubRepresented = guestDetails.guestClubRepresented;
    visitData.guestEmail = guestDetails.guestEmail || null;
  }

  const visit = await prisma.visitLog.create({
    data: visitData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: true,
      club: { select: { id: true, name: true } },
    },
  });

  auditKioskSignIn(req.ip, clubId, isAuthenticatedUser ? 'member' : 'guest', userId);
  res.status(201).json(visit);
});

// Public kiosk endpoint: list active visits for a kiosk session
router.get('/kiosk/:kioskToken/active', async (req: AuthRequest, res: Response) => {
  const kioskToken = req.params.kioskToken as string;

  // Validate kiosk token exists, is kiosk mode, and not expired
  const kioskLink = await prisma.signInLink.findUnique({
    where: { cryptoToken: kioskToken },
  });

  if (!kioskLink) {
    res.status(404).json({ error: 'Kiosk link not found' });
    return;
  }

  // Check if link is in kiosk mode (long expiry: 5 years)
  const isKioskMode = kioskLink.expiresAt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000;
  if (!isKioskMode) {
    res.status(400).json({ error: 'Not a kiosk link' });
    return;
  }

  if (kioskLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Kiosk link expired' });
    return;
  }

  // Get active visits for this kiosk's club
  const visits = await prisma.visitLog.findMany({
    where: {
      clubId: kioskLink.clubId,
      timeOut: null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: { select: { id: true, make: true, model: true, caliber: true } },
    },
    orderBy: { timeIn: 'desc' },
  });

  // Return only safe public fields, using publicVisitRef instead of id
  const safeVisits = visits.map(v => ({
    publicVisitRef: v.publicVisitRef,
    visitorName: v.memberUserIdSnapshot ? (v.user?.name ?? v.memberNameSnapshot) : v.guestName,
    visitorEmail: v.memberUserIdSnapshot ? (v.user?.email ?? v.memberEmailSnapshot) : v.guestEmail,
    guestClubRepresented: v.guestClubRepresented,
    purpose: v.purpose,
    timeIn: v.timeIn,
    firearm: v.firearmUsed
      ? `${v.firearmUsed.make} ${v.firearmUsed.model} (${v.firearmUsed.caliber})`
      : (v.firearmMakeSnapshot && v.firearmModelSnapshot && v.firearmCaliberSnapshot
        ? `${v.firearmMakeSnapshot} ${v.firearmModelSnapshot} (${v.firearmCaliberSnapshot})`
        : null),
  }));

  res.json(safeVisits);
});

// Public kiosk endpoint: sign out a visitor by publicVisitRef
router.post('/kiosk/:kioskToken/signout', async (req: AuthRequest, res: Response) => {
  const kioskToken = req.params.kioskToken as string;
  const { publicVisitRef } = req.body as { publicVisitRef?: string };

  if (!publicVisitRef || typeof publicVisitRef !== 'string') {
    res.status(400).json({ error: 'publicVisitRef is required' });
    return;
  }

  // Validate kiosk token exists, is kiosk mode, and not expired
  const kioskLink = await prisma.signInLink.findUnique({
    where: { cryptoToken: kioskToken },
  });

  if (!kioskLink) {
    res.status(404).json({ error: 'Kiosk link not found' });
    return;
  }

  const isKioskMode = kioskLink.expiresAt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000;
  if (!isKioskMode) {
    res.status(400).json({ error: 'Not a kiosk link' });
    return;
  }

  if (kioskLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Kiosk link expired' });
    return;
  }

  // Find and validate visit by publicVisitRef and club match
  const visit = await prisma.visitLog.findUnique({
    where: { publicVisitRef },
  });

  if (!visit) {
    res.status(404).json({ error: 'Visit not found' });
    return;
  }

  // Ensure visit belongs to this kiosk's club
  if (visit.clubId !== kioskLink.clubId) {
    res.status(403).json({ error: 'Visit does not belong to this kiosk' });
    return;
  }

  // Ensure visit is still active
  if (visit.timeOut) {
    res.status(409).json({ error: 'Already signed out' });
    return;
  }

  // Sign out
  const updated = await prisma.visitLog.update({
    where: { id: visit.id },
    data: { timeOut: new Date() },
  });

  res.json({ success: true, timeOut: updated.timeOut });
});

const createVisitSchema = z.object({
  clubId: z.string(),
  purpose: z.string().min(1),
  firearmUsedId: z.string().optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
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

  let firearmSnapshot: FirearmSnapshot | null = null;
  if (parsed.data.firearmUsedId) {
    const firearm = await prisma.firearm.findFirst({
      where: {
        id: parsed.data.firearmUsedId,
        deletedAt: null,
        OR: [
          { clubId: parsed.data.clubId, ownerType: OwnerType.CLUB },
          { userId: req.user!.id, ownerType: OwnerType.USER },
        ],
      },
      select: {
        serialNumber: true,
        make: true,
        model: true,
        caliber: true,
      },
    });

    if (!firearm) {
      res.status(400).json({ error: 'Firearm not found or does not belong to this club or user' });
      return;
    }

    firearmSnapshot = toFirearmSnapshot(firearm);
  }

  const memberSnapshot = await fetchMemberSnapshot(req.user!.id);
  if (!memberSnapshot) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const visit = await prisma.visitLog.create({
    data: {
      userId: req.user!.id,
      ...memberSnapshot,
      clubId: parsed.data.clubId,
      purpose: parsed.data.purpose,
      firearmUsedId: parsed.data.firearmUsedId,
      ...(firearmSnapshot ?? {}),
    },
  });
  res.status(201).json(visit);
});

router.patch('/:id/signout', requireAuth, async (req: AuthRequest, res: Response) => {
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

router.get('/mine', requireAuth, async (req: AuthRequest, res: Response) => {
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

router.get('/active', requireAuth, async (req: AuthRequest, res: Response) => {
  const visit = await prisma.visitLog.findFirst({
    where: { userId: req.user!.id, timeOut: null },
    include: {
      club: { select: { id: true, name: true } },
      firearmUsed: true,
    },
  });
  res.json(visit ?? null);
});

router.get('/club/:clubId', requireAuth, async (req: AuthRequest, res: Response) => {
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

// Admin endpoint: get active (signed-in) visitors for a club
router.get('/club/:clubId/active', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;

  // Verify user is an admin member of this club
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

  // Get active visits (timeOut is null) for this club
  const visits = await prisma.visitLog.findMany({
    where: {
      clubId,
      timeOut: null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: { select: { id: true, make: true, model: true, caliber: true } },
    },
    orderBy: { timeIn: 'desc' },
  });

  // Return safe fields, using publicVisitRef and id
  const safeVisits = visits.map(v => ({
    id: v.id,
    publicVisitRef: v.publicVisitRef,
    visitorName: v.memberUserIdSnapshot ? (v.user?.name ?? v.memberNameSnapshot) : v.guestName,
    visitorEmail: v.memberUserIdSnapshot ? (v.user?.email ?? v.memberEmailSnapshot) : v.guestEmail,
    guestClubRepresented: v.guestClubRepresented,
    purpose: v.purpose,
    timeIn: v.timeIn,
    firearm: v.firearmUsed
      ? `${v.firearmUsed.make} ${v.firearmUsed.model} (${v.firearmUsed.caliber})`
      : (v.firearmMakeSnapshot && v.firearmModelSnapshot && v.firearmCaliberSnapshot
        ? `${v.firearmMakeSnapshot} ${v.firearmModelSnapshot} (${v.firearmCaliberSnapshot})`
        : null),
  }));

  res.json(safeVisits);
});

// Admin endpoint: sign out a specific visitor by id
router.patch('/club/:clubId/:visitId/signout', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const visitId = req.params.visitId as string;

  // Verify user is an admin member of this club
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

  // Find the visit and verify it belongs to this club
  const visit = await prisma.visitLog.findFirst({
    where: {
      id: visitId,
      clubId,
    },
  });

  if (!visit) {
    res.status(404).json({ error: 'Visit not found' });
    return;
  }

  if (visit.timeOut !== null) {
    res.status(400).json({ error: 'This visitor is already signed out' });
    return;
  }

  // Sign out the visitor
  const updated = await prisma.visitLog.update({
    where: { id: visitId },
    data: { timeOut: new Date() },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: true,
      club: { select: { id: true, name: true } },
    },
  });

  res.json(updated);
});

router.get('/club/:clubId/history', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);
  const cursor = parseCursor(req.query.cursor);
  const filters = parseHistoryFilters(req);
  const searchMemberIds = filters.search
    ? await resolveHistoricalSearchMemberIds(clubId, filters.search)
    : [];
  const baseWhere = buildHistoryWhere(clubId, filters, searchMemberIds);
  const where = applyHistoryCursor(baseWhere, cursor);

  const rows = await prisma.visitLog.findMany({
    where,
    take: pageSize + 1,
    orderBy: [
      { timeIn: 'desc' },
      { id: 'desc' },
    ],
    select: {
      id: true,
      publicVisitRef: true,
      userId: true,
      purpose: true,
      timeIn: true,
      timeOut: true,
      guestName: true,
      guestEmail: true,
      guestClubRepresented: true,
      memberUserIdSnapshot: true,
      memberNameSnapshot: true,
      memberEmailSnapshot: true,
      firearmSerialSnapshot: true,
      firearmMakeSnapshot: true,
      firearmModelSnapshot: true,
      firearmCaliberSnapshot: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      firearmUsed: {
        select: {
          id: true,
          make: true,
          model: true,
          caliber: true,
          serialNumber: true,
        },
      },
    },
  });

  const hasNextPage = rows.length > pageSize;
  const visibleRows = hasNextPage ? rows.slice(0, pageSize) : rows;
  const lastRow = visibleRows[visibleRows.length - 1];

  const normalizedRows = visibleRows.map(row => ({
    ...row,
    visitorType: row.memberUserIdSnapshot ? 'member' : 'guest',
    memberUserId: row.userId ?? row.memberUserIdSnapshot,
    visitorName: row.memberUserIdSnapshot ? (row.user?.name ?? row.memberNameSnapshot) : (row.guestName ?? 'Guest Visitor'),
    visitorEmail: row.memberUserIdSnapshot ? (row.user?.email ?? row.memberEmailSnapshot) : row.guestEmail,
  }));

  res.json({
    rows: normalizedRows,
    nextCursor: hasNextPage && lastRow ? encodeCursor({ timeIn: lastRow.timeIn, id: lastRow.id }) : null,
  });
});

router.get('/club/:clubId/history/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const filters = parseHistoryFilters(req);
  const searchMemberIds = filters.search
    ? await resolveHistoricalSearchMemberIds(clubId, filters.search)
    : [];
  const where = buildHistoryWhere(clubId, filters, searchMemberIds);

  const [memberships, groupedByMember] = await Promise.all([
    prisma.clubMembership.findMany({
      where: {
        clubId,
        status: MembershipStatus.APPROVED,
      },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.visitLog.groupBy({
      by: ['userId'],
      where,
      _max: { timeIn: true },
    }),
  ]);

  const groupedMap = new Map(groupedByMember.map(row => [row.userId, row._max.timeIn ?? null]));
  const lastVisitPerMember = memberships.map(member => ({
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    lastVisitAt: groupedMap.get(member.userId) ?? null,
  }));

  const firearmId = typeof req.query.firearmId === 'string' ? req.query.firearmId : undefined;
  const firearmSerial = typeof req.query.firearmSerial === 'string' ? req.query.firearmSerial : undefined;

  const firearm = firearmId
    ? await prisma.firearm.findFirst({ where: { id: firearmId, clubId, deletedAt: null } })
    : firearmSerial
      ? await prisma.firearm.findFirst({ where: { serialNumber: firearmSerial, deletedAt: null } })
      : null;

  const firearmLastUsed = firearm
    ? await prisma.visitLog.findFirst({
        where: {
          clubId,
          firearmUsedId: firearm.id,
        },
        orderBy: { timeIn: 'desc' },
        select: {
          timeIn: true,
          firearmUsed: {
            select: {
              id: true,
              serialNumber: true,
              make: true,
              model: true,
              caliber: true,
            },
          },
        },
      })
    : null;

  const attendeeUserId = typeof req.query.attendeeUserId === 'string' ? req.query.attendeeUserId : undefined;
  const attendeeEmail = typeof req.query.attendeeEmail === 'string' ? req.query.attendeeEmail : undefined;
  const attendee = attendeeUserId
    ? await prisma.user.findUnique({ where: { id: attendeeUserId }, select: { id: true, name: true, email: true } })
    : attendeeEmail
      ? await prisma.user.findUnique({ where: { email: attendeeEmail }, select: { id: true, name: true, email: true } })
      : null;

  const attendanceCount = attendee
    ? await prisma.visitLog.count({
        where: {
          ...where,
          userId: attendee.id,
        },
      })
    : null;

  res.json({
    lastVisitPerMember,
    firearmLastUsed: firearmLastUsed
      ? {
          firearm: firearmLastUsed.firearmUsed,
          lastUsedAt: firearmLastUsed.timeIn,
        }
      : null,
    attendanceCount: attendee
      ? {
          attendee,
          count: attendanceCount,
        }
      : null,
  });
});

router.get('/club/:clubId/history/export.csv', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const filters = parseHistoryFilters(req);
  const searchMemberIds = filters.search
    ? await resolveHistoricalSearchMemberIds(clubId, filters.search)
    : [];
  const baseWhere = buildHistoryWhere(clubId, filters, searchMemberIds);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-history.csv"`);
  await streamSignInHistoryCsv(res, baseWhere);

  res.end();
});

// Admin endpoint: sign out all active visits for a club with explicit confirmation
router.patch('/club/:clubId/signout-all', requireAuth, async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const { confirm } = req.body as { confirm?: boolean };

  if (!confirm) {
    res.status(400).json({ error: 'confirm flag is required and must be true' });
    return;
  }

  // Verify user is an admin member of this club
  const adminMembership = await prisma.clubMembership.findFirst({
    where: {
      userId: req.user!.id,
      clubId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });

  if (!adminMembership) {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }

  // Sign out all active visits for this club
  const result = await prisma.visitLog.updateMany({
    where: {
      clubId,
      timeOut: null,
    },
    data: {
      timeOut: new Date(),
    },
  });

  res.json({ success: true, signedOutCount: result.count });
});

// Kiosk QR scan sign-in endpoint
const qrScanSchema = z.object({
  qrData: z.string().min(1, 'QR data is required'),
  clubId: z.string().min(1, 'Club ID is required'),
});

const qrPreviewSchema = z.object({
  qrData: z.string().min(1, 'QR data is required'),
  signInAccessToken: z.string().min(1, 'signInAccessToken is required'),
});

const qrConfirmSchema = z.object({
  signInAccessToken: z.string().min(1, 'signInAccessToken is required'),
  memberCardSignInToken: z.string().min(1, 'memberCardSignInToken is required'),
  purpose: z.string().min(1),
  firearmUsedId: z.string().optional(),
  firearmSerialNumber: z.string().trim().min(1).optional(),
});

router.post('/kiosk/qr-preview', async (req: AuthRequest, res: Response) => {
  const parsed = qrPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const accessPayload = verifySignInAccessToken(parsed.data.signInAccessToken);
  if (!accessPayload) {
    res.status(401).json({ error: 'Invalid or expired sign-in access token' });
    return;
  }

  const signInLink = await prisma.signInLink.findUnique({
    where: { id: accessPayload.signInLinkId },
  });

  if (!signInLink) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (signInLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  if (!isKioskLink(signInLink.expiresAt)) {
    res.status(400).json({ error: 'Only kiosk links support membership card scanning' });
    return;
  }

  const cardIdentity = parseMembershipCardQrData(parsed.data.qrData);
  if (!cardIdentity || cardIdentity.clubId !== accessPayload.clubId) {
    res.status(400).json({ error: 'Invalid QR code format or club mismatch' });
    return;
  }

  const clubSettings = await prisma.clubSettings.findUnique({
    where: { clubId: accessPayload.clubId },
  });

  if (!clubSettings?.memberCardSignInEnabled) {
    res.status(403).json({ error: 'Member card sign-in is not enabled for this club' });
    return;
  }

  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId: cardIdentity.userId,
      clubId: accessPayload.clubId,
      status: MembershipStatus.APPROVED,
    },
  });

  if (!membership) {
    res.status(404).json({ error: 'Member not found or not approved' });
    return;
  }

  const existingVisit = await prisma.visitLog.findFirst({
    where: {
      userId: cardIdentity.userId,
      clubId: accessPayload.clubId,
      timeOut: null,
    },
  });

  if (existingVisit) {
    res.status(409).json({ error: 'Member is already signed in' });
    return;
  }

  const member = await prisma.user.findUnique({
    where: { id: cardIdentity.userId },
    select: { id: true, name: true, email: true },
  });

  if (!member) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const userFirearms = await prisma.firearm.findMany({
    where: {
      userId: cardIdentity.userId,
      ownerType: OwnerType.USER,
      deletedAt: null,
    },
    select: {
      id: true,
      make: true,
      model: true,
      caliber: true,
      isFavorite: true,
    },
    orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
  });

  const memberCardSignInToken = jwt.sign(
    {
      signInLinkId: accessPayload.signInLinkId,
      clubId: accessPayload.clubId,
      userId: cardIdentity.userId,
      tokenType: 'member-card-sign-in',
    },
    jwtSecret,
    { expiresIn: `${Math.max(2, Math.floor(JWT_SIGN_IN_ACCESS_EXPIRES_MINUTES / 2))}m` }
  );

  res.status(200).json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
    },
    userFirearms,
    memberCardSignInToken,
  });
});

router.post('/kiosk/qr-signin-confirm', async (req: AuthRequest, res: Response) => {
  const parsed = qrConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const accessPayload = verifySignInAccessToken(parsed.data.signInAccessToken);
  if (!accessPayload) {
    res.status(401).json({ error: 'Invalid or expired sign-in access token' });
    return;
  }

  const cardPayload = verifyMemberCardSignInToken(parsed.data.memberCardSignInToken);
  if (!cardPayload) {
    res.status(401).json({ error: 'Invalid or expired member-card sign-in token' });
    return;
  }

  if (
    cardPayload.signInLinkId !== accessPayload.signInLinkId
    || cardPayload.clubId !== accessPayload.clubId
  ) {
    res.status(401).json({ error: 'Member-card token does not match this kiosk session' });
    return;
  }

  const signInLink = await prisma.signInLink.findUnique({
    where: { id: accessPayload.signInLinkId },
  });

  if (!signInLink) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }

  if (signInLink.expiresAt < new Date()) {
    res.status(410).json({ error: 'Link expired' });
    return;
  }

  if (!isKioskLink(signInLink.expiresAt)) {
    res.status(400).json({ error: 'Only kiosk links support membership card scanning' });
    return;
  }

  const clubSettings = await prisma.clubSettings.findUnique({
    where: { clubId: accessPayload.clubId },
  });

  if (!clubSettings?.memberCardSignInEnabled) {
    res.status(403).json({ error: 'Member card sign-in is not enabled for this club' });
    return;
  }

  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId: cardPayload.userId,
      clubId: accessPayload.clubId,
      status: MembershipStatus.APPROVED,
    },
  });

  if (!membership) {
    res.status(404).json({ error: 'Member not found or not approved' });
    return;
  }

  const existingVisit = await prisma.visitLog.findFirst({
    where: {
      userId: cardPayload.userId,
      clubId: accessPayload.clubId,
      timeOut: null,
    },
  });

  if (existingVisit) {
    res.status(409).json({ error: 'Member is already signed in' });
    return;
  }

  let firearmUsedId = parsed.data.firearmUsedId;

  if (firearmUsedId) {
    const ownedFirearm = await prisma.firearm.findFirst({
      where: {
        id: firearmUsedId,
        deletedAt: null,
        OR: [
          { clubId: accessPayload.clubId },
          { userId: cardPayload.userId, ownerType: OwnerType.USER },
        ],
      },
    });

    if (!ownedFirearm) {
      auditFirearmLinkDenied(req.ip, cardPayload.userId, accessPayload.clubId, firearmUsedId);
      res.status(400).json({ error: 'Firearm not found or does not belong to this club or user' });
      return;
    }
  }

  if (!firearmUsedId && parsed.data.firearmSerialNumber) {
    const existingFirearm = await prisma.firearm.findFirst({
      where: {
        serialNumber: parsed.data.firearmSerialNumber,
        deletedAt: null,
        OR: [
          { clubId: accessPayload.clubId, ownerType: OwnerType.CLUB },
          { userId: cardPayload.userId, ownerType: OwnerType.USER },
        ],
      },
    });

    if (existingFirearm) {
      firearmUsedId = existingFirearm.id;
    } else {
      const firearm = await prisma.firearm.create({
        data: {
          make: 'Unknown',
          model: 'Unknown',
          caliber: 'Unknown',
          serialNumber: parsed.data.firearmSerialNumber,
          ownerType: OwnerType.USER,
          userId: cardPayload.userId,
        },
      });
      firearmUsedId = firearm.id;
    }
  }

  const memberSnapshot = await fetchMemberSnapshot(cardPayload.userId);
  if (!memberSnapshot) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const visitData: {
    clubId: string;
    purpose: string;
    firearmUsedId?: string;
    userId: string;
    memberUserIdSnapshot: string;
    memberNameSnapshot: string;
    memberEmailSnapshot: string;
    firearmSerialSnapshot?: string;
    firearmMakeSnapshot?: string;
    firearmModelSnapshot?: string;
    firearmCaliberSnapshot?: string;
  } = {
    clubId: accessPayload.clubId,
    purpose: parsed.data.purpose,
    firearmUsedId,
    userId: cardPayload.userId,
    ...memberSnapshot,
  };

  const firearmSnapshot = await fetchFirearmSnapshot(firearmUsedId);
  if (firearmSnapshot) {
    Object.assign(visitData, firearmSnapshot);
  }

  const visit = await prisma.visitLog.create({
    data: visitData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: true,
      club: { select: { id: true, name: true } },
    },
  });

  auditKioskSignIn(req.ip, accessPayload.clubId, 'member', cardPayload.userId);
  res.status(201).json(visit);
});

router.post('/kiosk/qr-scan', attachOptionalAuth, async (req: AuthRequest, res: Response) => {
  const parsed = qrScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { qrData, clubId } = parsed.data;

  try {
    // Check if club has member card sign-in enabled
    const clubSettings = await prisma.clubSettings.findUnique({
      where: { clubId },
    });

    if (!clubSettings?.memberCardSignInEnabled) {
      res.status(403).json({ error: 'Member card sign-in is not enabled for this club' });
      return;
    }

    const cardIdentity = parseMembershipCardQrData(qrData);
    if (!cardIdentity || cardIdentity.clubId !== clubId) {
      res.status(400).json({ error: 'Invalid QR code format or club mismatch' });
      return;
    }

    const { userId } = cardIdentity;

    // Verify membership exists and is approved
    const membership = await prisma.clubMembership.findFirst({
      where: {
        userId,
        clubId,
        status: MembershipStatus.APPROVED,
      },
    });

    if (!membership) {
      res.status(404).json({ error: 'Member not found or not approved' });
      return;
    }

    // Check if user is already signed in
    const existingVisit = await prisma.visitLog.findFirst({
      where: {
        userId,
        clubId,
        timeOut: null,
      },
    });

    if (existingVisit) {
      res.status(409).json({ error: 'Member is already signed in' });
      return;
    }

    const memberSnapshot = await fetchMemberSnapshot(userId);
    if (!memberSnapshot) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Create visit log
    const visit = await prisma.visitLog.create({
      data: {
        userId,
        ...memberSnapshot,
        clubId,
        purpose: 'QR Card Sign-In',
        timeIn: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      visitId: visit.id,
      userId,
      clubId,
      timeIn: visit.timeIn,
      message: 'Successfully signed in via membership card',
    });
  } catch (error) {
    console.error('Error processing QR scan:', error);
    res.status(500).json({ error: 'Failed to process QR scan' });
  }
});

export default router;
