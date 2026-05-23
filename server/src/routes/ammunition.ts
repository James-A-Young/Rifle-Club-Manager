import { Router, Response } from 'express';
import { CashBoxTransactionReason, MembershipStatus, PaymentMethod, Prisma } from '../generated/client.js';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { formatZodError } from '../utils/zodError';
import { ensureAdminForClub } from '../utils/clubAccess';
import { streamSalesLedgerCsv } from '../services/exports/salesLedgerExport';

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const CSV_BATCH_SIZE = 1000;

router.use(requireAuth);

function escapeCsvCell(value: unknown): string {
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

const createTypeSchema = z.object({
  name: z.string().trim().min(1),
  pricePence: z.number().int().nonnegative(),
  reorderLevelQuantity: z.number().int().positive().optional().nullable(),
  reorderQuantity: z.number().int().positive().optional().nullable(),
  leadTimeDays: z.number().int().positive().optional().nullable(),
  safetyStockDays: z.number().int().nonnegative().optional().nullable(),
});

const updateTypeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  pricePence: z.number().int().nonnegative().optional(),
  reorderLevelQuantity: z.number().int().positive().optional().nullable(),
  reorderQuantity: z.number().int().positive().optional().nullable(),
  leadTimeDays: z.number().int().positive().optional().nullable(),
  safetyStockDays: z.number().int().nonnegative().optional().nullable(),
});

const createSafeSchema = z.object({
  name: z.string().trim().min(1),
});

const updateSafeSchema = z.object({
  name: z.string().trim().min(1),
});

const transferStockSchema = z.object({
  ammunitionTypeId: z.string().min(1),
  fromSafeId: z.string().min(1),
  toSafeId: z.string().min(1),
  quantity: z.number().int().positive(),
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
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
});

const reorderAnalysisQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(365).optional(),
});

function buildSalesWhere(clubId: string, req: AuthRequest): Prisma.AmmunitionSaleWhereInput {
  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : undefined;
  const buyerUserId = typeof req.query.buyerUserId === 'string' ? req.query.buyerUserId : undefined;
  const sellerUserId = typeof req.query.sellerUserId === 'string' ? req.query.sellerUserId : undefined;
  const paymentMethod = typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : undefined;
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
  if (paymentMethod && Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
    and.push({ paymentMethod: paymentMethod as PaymentMethod });
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
          reorderLevelQuantity: parsed.data.reorderLevelQuantity ?? null,
          reorderQuantity: parsed.data.reorderQuantity ?? null,
          leadTimeDays: parsed.data.leadTimeDays ?? null,
          safetyStockDays: parsed.data.safetyStockDays ?? null,
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Ammunition type with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create ammunition type' });
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
  if (
    !parsed.data.name
    && parsed.data.pricePence === undefined
    && !('reorderLevelQuantity' in parsed.data)
    && !('reorderQuantity' in parsed.data)
    && !('leadTimeDays' in parsed.data)
    && !('safetyStockDays' in parsed.data)
  ) {
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
          ...('reorderLevelQuantity' in parsed.data ? { reorderLevelQuantity: parsed.data.reorderLevelQuantity ?? null } : {}),
          ...('reorderQuantity' in parsed.data ? { reorderQuantity: parsed.data.reorderQuantity ?? null } : {}),
          ...('leadTimeDays' in parsed.data ? { leadTimeDays: parsed.data.leadTimeDays ?? null } : {}),
          ...('safetyStockDays' in parsed.data ? { safetyStockDays: parsed.data.safetyStockDays ?? null } : {}),
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Ammunition type with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update ammunition type' });
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Safe with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create safe' });
  }
});

router.patch('/club/:clubId/safes/:safeId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const safeId = req.params.safeId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = updateSafeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const existing = await prisma.ammunitionSafe.findFirst({ where: { id: safeId, clubId } });
  if (!existing) {
    res.status(404).json({ error: 'Safe not found' });
    return;
  }

  try {
    const updated = await prisma.ammunitionSafe.update({
      where: { id: safeId },
      data: { name: parsed.data.name },
    });
    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Safe with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to rename safe' });
  }
});

router.delete('/club/:clubId/safes/:safeId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const safeId = req.params.safeId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const existing = await prisma.ammunitionSafe.findFirst({ where: { id: safeId, clubId } });
  if (!existing) {
    res.status(404).json({ error: 'Safe not found' });
    return;
  }

  try {
    await prisma.$transaction(async tx => {
      await tx.clubSettings.updateMany({
        where: {
          clubId,
          ammoDefaultSalesSafeId: safeId,
        },
        data: {
          ammoDefaultSalesSafeId: null,
        },
      });
      await tx.ammunitionSafe.delete({ where: { id: safeId } });
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      res.status(409).json({ error: 'Cannot delete safe: it has associated sales or stock movement records' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete safe' });
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

router.post('/club/:clubId/stock/transfer', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = transferStockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  if (parsed.data.fromSafeId === parsed.data.toSafeId) {
    res.status(400).json({ error: 'Source and destination safes must be different' });
    return;
  }

  const [type, fromSafe, toSafe] = await Promise.all([
    prisma.ammunitionType.findFirst({ where: { id: parsed.data.ammunitionTypeId, clubId }, select: { id: true, name: true } }),
    prisma.ammunitionSafe.findFirst({ where: { id: parsed.data.fromSafeId, clubId }, select: { id: true, name: true } }),
    prisma.ammunitionSafe.findFirst({ where: { id: parsed.data.toSafeId, clubId }, select: { id: true, name: true } }),
  ]);

  if (!type || !fromSafe || !toSafe) {
    res.status(400).json({ error: 'Invalid type or safe for this club' });
    return;
  }

  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.ammunitionStock.updateMany({
        where: {
          clubId,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.fromSafeId,
          quantity: { gte: parsed.data.quantity },
        },
        data: { quantity: { decrement: parsed.data.quantity } },
      });
      if (updated.count !== 1) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      await tx.ammunitionStock.upsert({
        where: {
          ammunitionTypeId_ammunitionSafeId: {
            ammunitionTypeId: parsed.data.ammunitionTypeId,
            ammunitionSafeId: parsed.data.toSafeId,
          },
        },
        update: { quantity: { increment: parsed.data.quantity } },
        create: {
          clubId,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.toSafeId,
          quantity: parsed.data.quantity,
        },
      });

      await tx.ammunitionStockInput.create({
        data: {
          clubId,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.fromSafeId,
          quantity: -parsed.data.quantity,
          note: `Transfer to ${toSafe.name}`,
          inputByUserId: req.user!.id,
        },
      });

      await tx.ammunitionStockInput.create({
        data: {
          clubId,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.toSafeId,
          quantity: parsed.data.quantity,
          note: `Transfer from ${fromSafe.name}`,
          inputByUserId: req.user!.id,
        },
      });
    });

    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_STOCK') {
      res.status(400).json({ error: 'Insufficient stock in source safe' });
      return;
    }
    res.status(500).json({ error: 'Failed to transfer stock' });
  }
});

router.get('/club/:clubId/stock/inputs', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : undefined;
  const safeId = typeof req.query.safeId === 'string' ? req.query.safeId : undefined;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

  const and: Record<string, unknown>[] = [{ clubId }];
  if (typeId) and.push({ ammunitionTypeId: typeId });
  if (safeId) and.push({ ammunitionSafeId: safeId });
  if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
  if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lte: to } });

  const where: Prisma.AmmunitionStockInputWhereInput = { AND: and };

  let finalWhere = where;
  if (cursor) {
    const cursorRow = await prisma.ammunitionStockInput.findFirst({ where: { id: cursor, clubId }, select: { createdAt: true } });
    if (cursorRow) {
      finalWhere = {
        AND: [
          where,
          {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              { AND: [{ createdAt: cursorRow.createdAt }, { id: { lt: cursor } }] },
            ],
          },
        ],
      };
    }
  }

  const rows = await prisma.ammunitionStockInput.findMany({
    where: finalWhere,
    take: pageSize + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      ammunitionType: { select: { id: true, name: true } },
      ammunitionSafe: { select: { id: true, name: true } },
      inputBy: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  res.json({ rows: data, nextCursor });
});

router.get('/club/:clubId/stock/inputs/export.csv', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const typeId = typeof req.query.typeId === 'string' ? req.query.typeId : undefined;
  const safeId = typeof req.query.safeId === 'string' ? req.query.safeId : undefined;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

  const and: Record<string, unknown>[] = [{ clubId }];
  if (typeId) and.push({ ammunitionTypeId: typeId });
  if (safeId) and.push({ ammunitionSafeId: safeId });
  if (from && !Number.isNaN(from.getTime())) and.push({ createdAt: { gte: from } });
  if (to && !Number.isNaN(to.getTime())) and.push({ createdAt: { lte: to } });

  const where: Prisma.AmmunitionStockInputWhereInput = { AND: and };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="club-${clubId}-stock-movements.csv"`);
  res.write(['movement_id', 'recorded_at', 'ammunition_type', 'safe_name', 'quantity', 'note', 'recorded_by'].join(',') + '\n');

  let exportCursor: { createdAt: Date; id: string } | null = null;
  while (true) {
    const pagedWhere: Prisma.AmmunitionStockInputWhereInput = exportCursor
      ? {
          AND: [
            where,
            {
              OR: [
                { createdAt: { lt: exportCursor.createdAt } },
                { AND: [{ createdAt: exportCursor.createdAt }, { id: { lt: exportCursor.id } }] },
              ],
            },
          ],
        }
      : where;

    const rows = await prisma.ammunitionStockInput.findMany({
      where: pagedWhere,
      take: CSV_BATCH_SIZE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        ammunitionType: { select: { name: true } },
        ammunitionSafe: { select: { name: true } },
        inputBy: { select: { name: true } },
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      res.write([
        escapeCsvCell(row.id),
        escapeCsvCell(row.createdAt.toISOString()),
        escapeCsvCell(row.ammunitionType.name),
        escapeCsvCell(row.ammunitionSafe.name),
        escapeCsvCell(row.quantity),
        escapeCsvCell(row.note ?? ''),
        escapeCsvCell(row.inputBy.name),
      ].join(',') + '\n');
    }

    if (rows.length < CSV_BATCH_SIZE) break;
    const lastRow = rows[rows.length - 1];
    exportCursor = { createdAt: lastRow.createdAt, id: lastRow.id };
  }

  res.end();
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
  const paymentMethod = parsed.data.paymentMethod ?? PaymentMethod.CASH;

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

      const updatedStock = await tx.ammunitionStock.updateMany({
        where: {
          clubId,
          ammunitionTypeId: parsed.data.ammunitionTypeId,
          ammunitionSafeId: parsed.data.ammunitionSafeId,
          quantity: { gte: parsed.data.quantity },
        },
        data: {
          quantity: {
            decrement: parsed.data.quantity,
          },
        },
      });
      if (updatedStock.count !== 1) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      const sale = await tx.ammunitionSale.create({
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
          paymentMethod,
        },
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          soldBy: { select: { id: true, name: true, email: true } },
          ammunitionType: { select: { id: true, name: true } },
          ammunitionSafe: { select: { id: true, name: true } },
        },
      });

      if (paymentMethod === PaymentMethod.CASH) {
        const cashBox = await tx.cashBox.upsert({
          where: { clubId },
          update: {},
          create: { clubId, balancePence: 0 },
          select: { id: true, balancePence: true },
        });

        const nextBalancePence = cashBox.balancePence + sale.totalPricePence;

        await tx.cashBox.update({
          where: { id: cashBox.id },
          data: { balancePence: nextBalancePence },
        });

        await tx.cashBoxTransaction.create({
          data: {
            cashBoxId: cashBox.id,
            clubId,
            reason: CashBoxTransactionReason.AMMUNITION_SALE,
            amountPence: sale.totalPricePence,
            balanceAfterPence: nextBalancePence,
            relatedSaleId: sale.id,
            createdByUserId: req.user!.id,
            note: 'Auto-posted from ammunition sale',
          },
        });
      }

      return sale;
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

router.get('/club/:clubId/reorder-analysis', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsedQuery = reorderAnalysisQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: formatZodError(parsedQuery.error) });
    return;
  }

  const settings = await prisma.clubSettings.findUnique({
    where: { clubId },
    select: {
      ammoSalesLookbackDays: true,
      ammoDefaultLeadTimeDays: true,
      ammoDefaultSafetyStockDays: true,
    },
  });

  const lookbackDays = parsedQuery.data.lookbackDays ?? settings?.ammoSalesLookbackDays ?? 30;
  const analysisStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [types, stockByType, salesByType] = await Promise.all([
    prisma.ammunitionType.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        reorderLevelQuantity: true,
        reorderQuantity: true,
        leadTimeDays: true,
        safetyStockDays: true,
      },
    }),
    prisma.ammunitionStock.groupBy({
      by: ['ammunitionTypeId'],
      where: { clubId },
      _sum: { quantity: true },
    }),
    prisma.ammunitionSale.groupBy({
      by: ['ammunitionTypeId'],
      where: { clubId, createdAt: { gte: analysisStart } },
      _sum: { quantity: true },
    }),
  ]);

  const stockMap = new Map(stockByType.map(row => [row.ammunitionTypeId, row._sum.quantity ?? 0]));
  const salesMap = new Map(salesByType.map(row => [row.ammunitionTypeId, row._sum.quantity ?? 0]));

  const rows = types.map(type => {
    const currentStock = stockMap.get(type.id) ?? 0;
    const soldInWindow = salesMap.get(type.id) ?? 0;
    const avgDailyUsage = soldInWindow / lookbackDays;

    const leadTimeDays = type.leadTimeDays ?? settings?.ammoDefaultLeadTimeDays ?? 14;
    const safetyStockDays = type.safetyStockDays ?? settings?.ammoDefaultSafetyStockDays ?? 7;
    const suggestedReorderPoint = Math.ceil(avgDailyUsage * (leadTimeDays + safetyStockDays));
    const reorderPoint = type.reorderLevelQuantity ?? suggestedReorderPoint;
    const suggestedQuantity = Math.max(
      0,
      type.reorderQuantity ?? Math.ceil(avgDailyUsage * (leadTimeDays + safetyStockDays) * 2) - currentStock,
    );
    const daysUntilStockout = avgDailyUsage > 0 ? currentStock / avgDailyUsage : null;

    let status: 'OK' | 'LOW' | 'CRITICAL' = 'OK';
    const criticalThreshold = Math.max(0, Math.floor(reorderPoint / 2));
    if (currentStock <= criticalThreshold) {
      status = 'CRITICAL';
    } else if (currentStock <= reorderPoint) {
      status = 'LOW';
    }

    return {
      ammunitionTypeId: type.id,
      ammunitionTypeName: type.name,
      lookbackDays,
      currentStock,
      soldInWindow,
      avgDailyUsage,
      leadTimeDays,
      safetyStockDays,
      reorderPoint,
      suggestedReorderPoint,
      suggestedQuantity,
      daysUntilStockout,
      status,
    };
  });

  rows.sort((a, b) => {
    const severityOrder: Record<typeof a.status, number> = {
      CRITICAL: 0,
      LOW: 1,
      OK: 2,
    };
    if (severityOrder[a.status] !== severityOrder[b.status]) {
      return severityOrder[a.status] - severityOrder[b.status];
    }
    return a.ammunitionTypeName.localeCompare(b.ammunitionTypeName);
  });

  res.json({ lookbackDays, rows });
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
  await streamSalesLedgerCsv(res, where);

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
