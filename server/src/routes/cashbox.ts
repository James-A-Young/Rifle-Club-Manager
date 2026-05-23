import { Router, Response } from 'express';
import { CashBoxTransactionReason } from '../generated/client.js';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { ensureAdminForClub } from '../utils/clubAccess.js';
import { formatZodError } from '../utils/zodError.js';

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

router.use(requireAuth);

function parsePageSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

const createManualTransactionSchema = z.object({
  reason: z.enum([
    CashBoxTransactionReason.ADD_FLOAT,
    CashBoxTransactionReason.DONATION,
    CashBoxTransactionReason.FEE_PAYMENT,
    CashBoxTransactionReason.BANKED_CASH,
  ]),
  movement: z.enum(['ADD', 'DEDUCT']),
  amountPence: z.number().int().positive(),
  note: z.string().trim().max(500).optional().nullable(),
});

router.get('/club/:clubId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const cashBox = await prisma.cashBox.upsert({
    where: { clubId },
    update: {},
    create: { clubId, balancePence: 0 },
    select: {
      id: true,
      clubId: true,
      balancePence: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(cashBox);
});

router.get('/club/:clubId/transactions', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const pageSize = parsePageSize(req.query.pageSize);

  const rows = await prisma.cashBoxTransaction.findMany({
    where: { clubId },
    take: pageSize,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      relatedSale: {
        select: {
          id: true,
          buyerFirstName: true,
          buyerLastName: true,
          quantity: true,
          totalPricePence: true,
          paymentMethod: true,
        },
      },
    },
  });

  res.json(rows);
});

router.post('/club/:clubId/transactions', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const parsed = createManualTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const signedAmount = parsed.data.movement === 'DEDUCT'
    ? -parsed.data.amountPence
    : parsed.data.amountPence;

  try {
    const result = await prisma.$transaction(async tx => {
      const cashBox = await tx.cashBox.upsert({
        where: { clubId },
        update: {},
        create: { clubId, balancePence: 0 },
        select: { id: true, balancePence: true },
      });

      const nextBalancePence = cashBox.balancePence + signedAmount;
      if (nextBalancePence < 0) {
        throw new Error('NEGATIVE_BALANCE');
      }

      await tx.cashBox.update({
        where: { id: cashBox.id },
        data: { balancePence: nextBalancePence },
      });

      return tx.cashBoxTransaction.create({
        data: {
          cashBoxId: cashBox.id,
          clubId,
          reason: parsed.data.reason,
          amountPence: signedAmount,
          balanceAfterPence: nextBalancePence,
          createdByUserId: req.user!.id,
          note: parsed.data.note ? parsed.data.note.trim() : null,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'NEGATIVE_BALANCE') {
      res.status(400).json({ error: 'Transaction would make cashbox balance negative' });
      return;
    }

    res.status(500).json({ error: 'Failed to record cashbox transaction' });
  }
});

export default router;
