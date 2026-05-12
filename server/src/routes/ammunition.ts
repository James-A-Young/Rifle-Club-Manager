import { Router, Response } from 'express';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { formatZodError } from '../utils/zodError';

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const CSV_BATCH_SIZE = 1000;

router.use(requireAuth);

function csvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function parsePageSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

async function ensureAdminForClub(userId: string, clubId: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId,
      clubId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.APPROVED,
    },
    select: { id: true },
  });
  return Boolean(membership);
}

const createTypeSchema = z.object({
  name: z.string().trim().min(1),
  pricePence: z.number().int().nonnegative(),
});

const updateTypeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  pricePence: z.number().int().nonnegative().optional(),
});

const createSafeSchema = z.object({
  name: z.string().trim().min(1),
});

const stockInputSchema = z.object({
  ammunitionTypeId: z.string().min(1),
  ammunitionSafeId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const createSaleSchema = z.object({
  buyerFirstName: z.string().trim().min(1),
  buyerLastName: z.string().trim().min(1),
  buyerUserId: z.string().min(1).optional().nullable(),
  ammunitionTypeId: z.string().min(1),
  ammunitionSafeId: z.string().min(1),
  quantity: z.number().int().positive(),
});

function buildSalesWhere(clubId: string, req: AuthRequest) {
  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : undefined;
  const buyerUserId = typeof req.query.buyerUserId === 'string' ? req.query.buyerUserId : undefined;
  const sellerUserId = typeof req.query.sellerUserId === 'string' ? req.query.sellerUserId : undefined;
  const buyerSearch = typeof req.query.buyerSearch === 'string' ? req.query.buyerSearch.trim() : undefined;
  const sellerSearch = typeof req.query.sellerSearch === 'string' ? req.query.sellerSearch.trim() : undefined;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

  const and: Record<string, unknown>[] = [{ clubId }];

  if (typeId) {
    and.push({ ammunitionTypeId: typeId });
  }
  if (buyerUserId) {
    and.push({ buyerUserId });
  }
  if (sellerUserId) {
    and.push({ soldByUserId: sellerUserId });
  }
  if (from && !Number.isNaN(from.getTime())) {
    and.push({ createdAt: { gte: from } });
  }
  if (to && !Number.isNaN(to.getTime())) {
    and.push({ createdAt: { lte: to } });
  }
  if (buyerSearch) {
    and.push({
      OR: [
        { buyerFirstName: { contains: buyerSearch, mode: 'insensitive' } },
        { buyerLastName: { contains: buyerSearch, mode: 'insensitive' } },
        { buyer: { is: { name: { contains: buyerSearch, mode: 'insensitive' } } } },
        { buyer: { is: { email: { contains: buyerSearch, mode: 'insensitive' } } } },
      ],
    });
  }
  if (sellerSearch) {
    and.push({
      soldBy: {
        is: {
          OR: [
            { name: { contains: sellerSearch, mode: 'insensitive' } },
            { email: { contains: sellerSearch, mode: 'insensitive' } },
          ],
        },
      },
    });
  }

  return { AND: and };
}

router.get('/club/:clubId/settings', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [types, safes] = await Promise.all([
    prisma.ammunitionType.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      include: {
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
      },
    }),
    prisma.ammunitionSafe.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.json({ types, safes });
});

router.post('/club/:clubId/types', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    const created = await prisma.$transaction(async tx => {
      const type = await tx.ammunitionType.create({
        data: {
          clubId,
          name: parsed.data.name,
          currentPricePence: parsed.data.pricePence,
        },
      });
      await tx.ammunitionTypePriceHistory.create({
        data: {
          ammunitionTypeId: type.id,
          pricePence: parsed.data.pricePence,
        },
      });
      return tx.ammunitionType.findUniqueOrThrow({
        where: { id: type.id },
        include: {
          priceHistory: {
            orderBy: { createdAt: 'desc' },
            take: 25,
          },
        },
      });
    });

    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: 'Ammunition type with this name already exists' });
  }
});

router.patch('/club/:clubId/types/:typeId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const typeId = req.params.typeId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  if (!parsed.data.name && parsed.data.pricePence === undefined) {
    res.status(400).json({ error: 'No updates supplied' });
    return;
  }

  const existing = await prisma.ammunitionType.findFirst({
    where: { id: typeId, clubId },
  });
  if (!existing) {
    res.status(404).json({ error: 'Ammunition type not found' });
    return;
  }

  try {
    const updated = await prisma.$transaction(async tx => {
      const type = await tx.ammunitionType.update({
        where: { id: typeId },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.pricePence !== undefined ? { currentPricePence: parsed.data.pricePence } : {}),
        },
      });

      if (parsed.data.pricePence !== undefined && parsed.data.pricePence !== existing.currentPricePence) {
        await tx.ammunitionTypePriceHistory.create({
          data: {
            ammunitionTypeId: type.id,
            pricePence: parsed.data.pricePence,
          },
        });
      }

      return tx.ammunitionType.findUniqueOrThrow({
        where: { id: type.id },
        include: {
          priceHistory: {
            orderBy: { createdAt: 'desc' },
            take: 25,
          },
        },
      });
    });

    res.json(updated);
  } catch {
    res.status(409).json({ error: 'Ammunition type with this name already exists' });
  }
});

router.post('/club/:clubId/safes', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createSafeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    const safe = await prisma.ammunitionSafe.create({
      data: {
        clubId,
        name: parsed.data.name,
      },
    });
    res.status(201).json(safe);
  } catch {
    res.status(409).json({ error: 'Safe with this name already exists' });
  }
});

router.get('/club/:clubId/stock', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [types, safes, stock] = await Promise.all([
    prisma.ammunitionType.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, currentPricePence: true },
    }),
    prisma.ammunitionSafe.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.ammunitionStock.findMany({
      where: { clubId },
      select: {
        id: true,
        quantity: true,
        ammunitionTypeId: true,
        ammunitionSafeId: true,
      },
    }),
  ]);

  res.json({ types, safes, stock });
});

router.post('/club/:clubId/stock/input', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = stockInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const type = await prisma.ammunitionType.findFirst({
    where: { id: parsed.data.ammunitionTypeId, clubId },
    select: { id: true },
  });
  const safe = await prisma.ammunitionSafe.findFirst({
    where: { id: parsed.data.ammunitionSafeId, clubId },
    select: { id: true },
  });
  if (!type || !safe) {
    res.status(400).json({ error: 'Invalid type or safe for this club' });
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.ammunitionStock.upsert({
      where: {
        ammunitionTypeId_ammunitionSafeId: {
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.ammunitionSafeId,
        },
      },
      update: {
        quantity: {
          increment: parsed.data.quantity,
        },
      },
      create: {
        clubId,
        ammunitionTypeId: parsed.data.ammunitionTypeId,
        ammunitionSafeId: parsed.data.ammunitionSafeId,
        quantity: parsed.data.quantity,
      },
    });

    await tx.ammunitionStockInput.create({
      data: {
        clubId,
        ammunitionTypeId: parsed.data.ammunitionTypeId,
        ammunitionSafeId: parsed.data.ammunitionSafeId,
        quantity: parsed.data.quantity,
        inputByUserId: req.user!.id,
      },
    });
  });

  res.status(201).json({ success: true });
});

router.get('/club/:clubId/stock/inputs', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);
  const rows = await prisma.ammunitionStockInput.findMany({
    where: { clubId },
    take: pageSize,
    orderBy: { createdAt: 'desc' },
    include: {
      ammunitionType: { select: { id: true, name: true } },
      ammunitionSafe: { select: { id: true, name: true } },
      inputBy: { select: { id: true, name: true, email: true } },
    },
  });

  res.json(rows);
});

router.post('/club/:clubId/sales', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const buyerUserId = parsed.data.buyerUserId ?? null;

  if (buyerUserId) {
    const buyerMembership = await prisma.clubMembership.findFirst({
      where: {
        clubId,
        userId: buyerUserId,
        status: MembershipStatus.APPROVED,
      },
      select: { id: true },
    });
    if (!buyerMembership) {
      res.status(400).json({ error: 'Selected buyer is not an approved member of this club' });
      return;
    }
  }

  try {
    const sale = await prisma.$transaction(async tx => {
      const type = await tx.ammunitionType.findFirst({
        where: { id: parsed.data.ammunitionTypeId, clubId },
        select: { id: true, currentPricePence: true },
      });
      const safe = await tx.ammunitionSafe.findFirst({
        where: { id: parsed.data.ammunitionSafeId, clubId },
        select: { id: true },
      });
      if (!type || !safe) {
        throw new Error('INVALID_REFERENCE');
      }

      const stock = await tx.ammunitionStock.findUnique({
        where: {
          ammunitionTypeId_ammunitionSafeId: {
            ammunitionTypeId: parsed.data.ammunitionTypeId,
            ammunitionSafeId: parsed.data.ammunitionSafeId,
          },
        },
      });
      if (!stock || stock.quantity < parsed.data.quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      await tx.ammunitionStock.update({
        where: { id: stock.id },
        data: {
          quantity: {
            decrement: parsed.data.quantity,
          },
        },
      });

      return tx.ammunitionSale.create({
        data: {
          clubId,
          buyerFirstName: parsed.data.buyerFirstName,
          buyerLastName: parsed.data.buyerLastName,
          buyerUserId,
          soldByUserId: req.user!.id,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.ammunitionSafeId,
          quantity: parsed.data.quantity,
          unitPricePence: type.currentPricePence,
          totalPricePence: type.currentPricePence * parsed.data.quantity,
        },
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          soldBy: { select: { id: true, name: true, email: true } },
          ammunitionType: { select: { id: true, name: true } },
          ammunitionSafe: { select: { id: true, name: true } },
        },
      });
    });

    res.status(201).json(sale);
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_STOCK') {
      res.status(400).json({ error: 'Insufficient stock in selected safe' });
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_REFERENCE') {
      res.status(400).json({ error: 'Invalid ammunition type or safe for this club' });
      return;
    }
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

router.get('/club/:clubId/sales', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);
  const where = buildSalesWhere(clubId, req);

  const rows = await prisma.ammunitionSale.findMany({
    where,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      soldBy: { select: { id: true, name: true, email: true } },
      ammunitionType: { select: { id: true, name: true } },
      ammunitionSafe: { select: { id: true, name: true } },
    },
  });

  res.json(rows);
});

router.get('/club/:clubId/sales/export.csv', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const where = buildSalesWhere(clubId, req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-ammunition-sales.csv"`);
  res.write([
    'sale_id',
    'sold_at',
    'buyer_first_name',
    'buyer_last_name',
    'buyer_user_id',
    'seller_user_id',
    'seller_name',
    'ammunition_type',
    'safe_name',
    'quantity',
    'unit_price_pence',
    'total_price_pence',
  ].join(',') + '\n');

  let skip = 0;
  while (true) {
    const rows = await prisma.ammunitionSale.findMany({
      where,
      skip,
      take: CSV_BATCH_SIZE,
      orderBy: { createdAt: 'desc' },
      include: {
        soldBy: { select: { name: true } },
        ammunitionType: { select: { name: true } },
        ammunitionSafe: { select: { name: true } },
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      res.write([
        csvCell(row.id),
        csvCell(row.createdAt.toISOString()),
        csvCell(row.buyerFirstName),
        csvCell(row.buyerLastName),
        csvCell(row.buyerUserId ?? ''),
        csvCell(row.soldByUserId),
        csvCell(row.soldBy.name),
        csvCell(row.ammunitionType.name),
        csvCell(row.ammunitionSafe.name),
        csvCell(row.quantity),
        csvCell(row.unitPricePence),
        csvCell(row.totalPricePence),
      ].join(',') + '\n');
    }

    if (rows.length < CSV_BATCH_SIZE) {
      break;
    }
    skip += CSV_BATCH_SIZE;
  }

  res.end();
});

router.get('/mine', async (req: AuthRequest, res: Response) => {
  const rows = await prisma.ammunitionSale.findMany({
    where: { buyerUserId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      club: { select: { id: true, name: true } },
      ammunitionType: { select: { id: true, name: true } },
      soldBy: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
});

export default router;
