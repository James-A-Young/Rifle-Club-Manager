import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest, attachOptionalAuth } from '../middleware/auth';
import { MembershipStatus, MembershipRole, OwnerType, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CSV_BATCH_SIZE = 1000;

type TimeWindowPreset = '3m' | '6m' | '12m' | 'custom';

type HistoryFilters = {
  search?: string;
  memberId?: string;
  firearmId?: string;
  firearmSerial?: string;
  from?: Date;
  to?: Date;
};

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

  return {
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    memberId: typeof req.query.memberId === 'string' ? req.query.memberId : undefined,
    firearmId: typeof req.query.firearmId === 'string' ? req.query.firearmId : undefined,
    firearmSerial: typeof req.query.firearmSerial === 'string' ? req.query.firearmSerial.trim() : undefined,
    from,
    to,
  };
}

function buildHistoryWhere(clubId: string, filters: HistoryFilters): Prisma.VisitLogWhereInput {
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
    andFilters.push({ userId: filters.memberId });
  }

  if (filters.firearmId) {
    andFilters.push({ firearmUsedId: filters.firearmId });
  }

  if (filters.firearmSerial) {
    andFilters.push({
      firearmUsed: {
        is: {
          serialNumber: {
            contains: filters.firearmSerial,
            mode: 'insensitive',
          },
        },
      },
    });
  }

  if (filters.search) {
    andFilters.push({
      OR: [
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
          firearmUsed: {
            is: {
              serialNumber: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          },
        },
      ],
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

async function ensureAdminForClub(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId,
      clubId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
  });

  return Boolean(membership);
}

function csvCell(value: unknown): string {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

const publicCreateVisitSchema = z.object({
  signInToken: z.string().min(1).optional(),
  signInAccessToken: z.string().min(1).optional(),
  purpose: z.string().min(1),
  firearmUsedId: z.string().optional(),
  firearmSerialNumber: z.string().trim().min(1).optional(),
  userDetails: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    address: z.string().min(5),
    placeOfBirth: z.string().min(2),
    dateOfBirth: z.string().min(1),
    gdprConsent: z.boolean().refine(v => v === true, { message: 'GDPR consent required' }),
  }),
}).refine(data => Boolean(data.signInToken || data.signInAccessToken), {
  message: 'signInToken or signInAccessToken is required',
});

router.post('/public', attachOptionalAuth, async (req: AuthRequest, res: Response) => {
  const parsed = publicCreateVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  let signInLinkId: string | undefined;
  let clubIdFromAccess: string | undefined;

  if (parsed.data.signInAccessToken) {
    try {
      const payload = jwt.verify(parsed.data.signInAccessToken, process.env.JWT_SECRET ?? 'secret') as {
        signInLinkId: string;
        clubId: string;
        tokenType: string;
      };

      if (payload.tokenType === 'sign-in-access') {
        signInLinkId = payload.signInLinkId;
        clubIdFromAccess = payload.clubId;
      }
    } catch {
      res.status(401).json({ error: 'Invalid or expired sign-in access token' });
      return;
    }
  }

  const signInLink = signInLinkId
    ? await prisma.signInLink.findUnique({
        where: { id: signInLinkId },
        include: {
          club: {
            include: {
              firearms: true,
            },
          },
        },
      })
    : await prisma.signInLink.findUnique({
        where: { cryptoToken: parsed.data.signInToken },
        include: {
          club: {
            include: {
              firearms: true,
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

  const details = parsed.data.userDetails;
  let userId = req.user?.id;

  if (userId) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      userId = undefined;
    }
  }

  if (!userId) {
    const randomPasswordHash = await bcrypt.hash(`${Date.now()}-${Math.random()}`, 10);
    const user = await prisma.user.upsert({
      where: { email: details.email },
      update: {
        name: details.name,
        address: details.address,
        placeOfBirth: details.placeOfBirth,
        dateOfBirth: new Date(details.dateOfBirth),
        gdprConsentDate: new Date(),
      },
      create: {
        name: details.name,
        email: details.email,
        passwordHash: randomPasswordHash,
        gdprConsentDate: new Date(),
        address: details.address,
        placeOfBirth: details.placeOfBirth,
        dateOfBirth: new Date(details.dateOfBirth),
      },
    });
    userId = user.id;
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: details.name,
        address: details.address,
        placeOfBirth: details.placeOfBirth,
        dateOfBirth: new Date(details.dateOfBirth),
        gdprConsentDate: new Date(),
      },
    });
  }

  let firearmUsedId = parsed.data.firearmUsedId;
  if (!firearmUsedId && parsed.data.firearmSerialNumber) {
    const existingFirearm = await prisma.firearm.findFirst({
      where: {
        serialNumber: parsed.data.firearmSerialNumber,
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
          userId,
        },
      });
      firearmUsedId = firearm.id;
    }
  }

  const visit = await prisma.visitLog.create({
    data: {
      userId,
      clubId: signInLink.clubId,
      purpose: parsed.data.purpose,
      firearmUsedId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      firearmUsed: true,
      club: { select: { id: true, name: true } },
    },
  });

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
    visitorName: v.user.name,
    visitorEmail: v.user.email,
    purpose: v.purpose,
    timeIn: v.timeIn,
    firearm: v.firearmUsed ? `${v.firearmUsed.make} ${v.firearmUsed.model} (${v.firearmUsed.caliber})` : null,
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

router.get('/club/:clubId/history', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);
  const cursor = parseCursor(req.query.cursor);
  const filters = parseHistoryFilters(req);
  const baseWhere = buildHistoryWhere(clubId, filters);
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
      purpose: true,
      timeIn: true,
      timeOut: true,
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

  res.json({
    rows: visibleRows,
    nextCursor: hasNextPage && lastRow ? encodeCursor({ timeIn: lastRow.timeIn, id: lastRow.id }) : null,
  });
});

router.get('/club/:clubId/history/summary', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const filters = parseHistoryFilters(req);
  const where = buildHistoryWhere(clubId, filters);

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
    ? await prisma.firearm.findFirst({ where: { id: firearmId, clubId } })
    : firearmSerial
      ? await prisma.firearm.findFirst({ where: { serialNumber: firearmSerial } })
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

router.get('/club/:clubId/history/export.csv', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const filters = parseHistoryFilters(req);
  const baseWhere = buildHistoryWhere(clubId, filters);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-history.csv"`);

  res.write([
    'visit_id',
    'visitor_name',
    'visitor_email',
    'purpose',
    'firearm_serial',
    'firearm_make',
    'firearm_model',
    'firearm_caliber',
    'time_in',
    'time_out',
  ].join(',') + '\n');

  let cursor: { timeIn: Date; id: string } | null = null;

  while (true) {
    const where = applyHistoryCursor(baseWhere, cursor);
    const rows = await prisma.visitLog.findMany({
      where,
      take: CSV_BATCH_SIZE,
      orderBy: [
        { timeIn: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        purpose: true,
        timeIn: true,
        timeOut: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        firearmUsed: {
          select: {
            serialNumber: true,
            make: true,
            model: true,
            caliber: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      res.write([
        csvCell(row.id),
        csvCell(row.user.name),
        csvCell(row.user.email),
        csvCell(row.purpose),
        csvCell(row.firearmUsed?.serialNumber ?? ''),
        csvCell(row.firearmUsed?.make ?? ''),
        csvCell(row.firearmUsed?.model ?? ''),
        csvCell(row.firearmUsed?.caliber ?? ''),
        csvCell(row.timeIn.toISOString()),
        csvCell(row.timeOut ? row.timeOut.toISOString() : ''),
      ].join(',') + '\n');
    }

    if (rows.length < CSV_BATCH_SIZE) {
      break;
    }

    const last = rows[rows.length - 1];
    cursor = { timeIn: last.timeIn, id: last.id };
  }

  res.end();
});

// Admin endpoint: sign out all active visits for a club with explicit confirmation
router.patch('/club/:clubId/signout-all', async (req: AuthRequest, res: Response) => {
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

export default router;
