import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { MembershipStatus, Prisma } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import { ensureAdminForClub, ensureMemberOfClub } from '../utils/clubAccess';
import { buildRawSeasonCompetitionResultsCsv } from '../services/exports/competitionResultsExport';

const router = Router();

router.use(requireAuth);

function escapeCsvCell(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createSeasonSchema = z.object({
  name: z.string().trim().min(1),
});

const updateSeasonSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isArchived: z.boolean().optional(),
});

const roundDueDateSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'Date must be in YYYY-MM-DD or ISO format')
    .refine(v => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100
        && (v.length === 10 ? (d.getMonth() + 1) === Number(v.slice(5, 7)) && d.getDate() === Number(v.slice(8, 10)) : true);
    }, { message: 'Invalid date value' }),
});

const createCompetitionSchema = z.object({
  seasonId: z.string().min(1),
  name: z.string().trim().min(1),
  organiser: z.string().trim().optional().nullable(),
  roundCount: z.number().int().min(1).max(52),
  cardsPerRound: z.number().int().min(1).max(20),
  rounds: z.array(roundDueDateSchema),
}).refine(d => d.rounds.length === d.roundCount, {
  message: 'rounds array length must match roundCount',
  path: ['rounds'],
});

const updateCompetitionSchema = z.object({
  name: z.string().trim().min(1).optional(),
  organiser: z.string().trim().optional().nullable(),
  roundCount: z.number().int().min(1).max(52).optional(),
  cardsPerRound: z.number().int().min(1).max(20).optional(),
  rounds: z.array(z.object({
    roundNumber: z.number().int().min(1),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'Date must be in YYYY-MM-DD or ISO format')
      .refine(v => {
        const d = new Date(v);
        return !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100
          && (v.length === 10 ? (d.getMonth() + 1) === Number(v.slice(5, 7)) && d.getDate() === Number(v.slice(8, 10)) : true);
      }, { message: 'Invalid date value' }),
  })).optional(),
});

const enrolMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
});

const updateScoreSchema = z.object({
  score: z.number().int().min(0).max(10000).nullable(),
});

// ---------------------------------------------------------------------------
// Season CRUD
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/seasons', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const seasons = await prisma.season.findMany({
    where: { clubId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { competitions: true } } },
  });
  res.json(seasons);
});

router.post('/clubs/:clubId/scoring/seasons', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = createSeasonSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  let season;
  try {
    season = await prisma.season.create({
      data: { clubId, name: parsed.data.name },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'A season with that name already exists in this club' });
      return;
    }
    throw e;
  }
  res.status(201).json(season);
});

router.patch('/clubs/:clubId/scoring/seasons/:seasonId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const seasonId = req.params.seasonId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const existing = await prisma.season.findFirst({ where: { id: seasonId, clubId }, select: { id: true } });
  if (!existing) { res.status(404).json({ error: 'Season not found' }); return; }

  const parsed = updateSeasonSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  const season = await prisma.season.update({
    where: { id: seasonId },
    data: parsed.data,
  });
  res.json(season);
});

router.delete('/clubs/:clubId/scoring/seasons/:seasonId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const seasonId = req.params.seasonId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const existing = await prisma.season.findFirst({ where: { id: seasonId, clubId }, select: { id: true } });
  if (!existing) { res.status(404).json({ error: 'Season not found' }); return; }

  await prisma.season.delete({ where: { id: seasonId } });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Competition CRUD
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/seasons/:seasonId/competitions', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const seasonId = req.params.seasonId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const season = await prisma.season.findFirst({ where: { id: seasonId, clubId }, select: { id: true } });
  if (!season) { res.status(404).json({ error: 'Season not found' }); return; }

  const competitions = await prisma.competition.findMany({
    where: { seasonId, clubId },
    orderBy: { createdAt: 'asc' },
    include: {
      rounds: { orderBy: { roundNumber: 'asc' } },
      _count: { select: { entries: true } },
    },
  });
  res.json(competitions);
});

router.post('/clubs/:clubId/scoring/competitions', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = createCompetitionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  const season = await prisma.season.findFirst({
    where: { id: parsed.data.seasonId, clubId },
    select: { id: true },
  });
  if (!season) { res.status(400).json({ error: 'Season not found in this club' }); return; }

  let competition;
  try {
    competition = await prisma.$transaction(async tx => {
      const comp = await tx.competition.create({
        data: {
          clubId,
          seasonId: parsed.data.seasonId,
          name: parsed.data.name,
          organiser: parsed.data.organiser ?? null,
          roundCount: parsed.data.roundCount,
          cardsPerRound: parsed.data.cardsPerRound,
        },
      });

      await tx.round.createMany({
        data: parsed.data.rounds.map((r, i) => ({
          competitionId: comp.id,
          roundNumber: i + 1,
          dueDate: new Date(r.dueDate),
        })),
      });

      return tx.competition.findUnique({
        where: { id: comp.id },
        include: { rounds: { orderBy: { roundNumber: 'asc' } } },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'A competition with that name already exists in this season' });
      return;
    }
    throw e;
  }

  res.status(201).json(competition);
});

router.patch('/clubs/:clubId/scoring/competitions/:competitionId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const comp = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
    select: { id: true },
  });
  if (!comp) { res.status(404).json({ error: 'Competition not found' }); return; }

  const parsed = updateCompetitionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  const roundUpdatesByNumber = new Map<number, string>();
  if (parsed.data.rounds) {
    for (const roundUpdate of parsed.data.rounds) {
      if (roundUpdatesByNumber.has(roundUpdate.roundNumber)) {
        res.status(400).json({ error: 'Duplicate roundNumber in rounds update payload' });
        return;
      }
      roundUpdatesByNumber.set(roundUpdate.roundNumber, roundUpdate.dueDate);
    }
  }

  try {
    await prisma.$transaction(async tx => {
      const current = await tx.competition.findUnique({
        where: { id: competitionId },
        include: {
          rounds: {
            orderBy: { roundNumber: 'asc' },
            select: { id: true, roundNumber: true, dueDate: true },
          },
        },
      });
      if (!current || current.clubId !== clubId) {
        throw new Error('Competition not found');
      }

      const nextRoundCount = parsed.data.roundCount ?? current.roundCount;
      const nextCardsPerRound = parsed.data.cardsPerRound ?? current.cardsPerRound;

      if (roundUpdatesByNumber.size > 0) {
        for (const roundNumber of roundUpdatesByNumber.keys()) {
          if (roundNumber > nextRoundCount) {
            throw new Error('Round update references a roundNumber outside the target roundCount');
          }
        }
      }

      if (nextRoundCount < current.roundCount) {
        const removedRoundsScoreCount = await tx.score.count({
          where: {
            competitionId,
            score: { not: null },
            round: {
              competitionId,
              roundNumber: { gt: nextRoundCount },
            },
          },
        });
        if (removedRoundsScoreCount > 0) {
          throw new Error('Cannot reduce round count because removed rounds have recorded scores');
        }
      }

      if (nextCardsPerRound < current.cardsPerRound) {
        const removedCardsScoreCount = await tx.score.count({
          where: {
            competitionId,
            score: { not: null },
            cardNumber: { gt: nextCardsPerRound },
            round: {
              competitionId,
              roundNumber: { lte: nextRoundCount },
            },
          },
        });
        if (removedCardsScoreCount > 0) {
          throw new Error('Cannot reduce cards per round because removed cards have recorded scores');
        }
      }

      if (nextRoundCount < current.roundCount) {
        await tx.score.deleteMany({
          where: {
            competitionId,
            round: {
              competitionId,
              roundNumber: { gt: nextRoundCount },
            },
          },
        });

        await tx.round.deleteMany({
          where: {
            competitionId,
            roundNumber: { gt: nextRoundCount },
          },
        });
      }

      if (nextCardsPerRound < current.cardsPerRound) {
        await tx.score.deleteMany({
          where: {
            competitionId,
            cardNumber: { gt: nextCardsPerRound },
            round: {
              competitionId,
              roundNumber: { lte: nextRoundCount },
            },
          },
        });
      }

      const roundCreateData: { competitionId: string; roundNumber: number; dueDate: Date }[] = [];
      if (nextRoundCount > current.roundCount) {
        for (let roundNumber = current.roundCount + 1; roundNumber <= nextRoundCount; roundNumber++) {
          const dueDate = roundUpdatesByNumber.get(roundNumber);
          if (!dueDate) {
            throw new Error(`Due date is required for new round ${roundNumber}`);
          }
          roundCreateData.push({
            competitionId,
            roundNumber,
            dueDate: new Date(dueDate),
          });
        }
      }

      if (roundCreateData.length > 0) {
        await tx.round.createMany({ data: roundCreateData });
      }

      await tx.competition.update({
        where: { id: competitionId },
        data: {
          ...(parsed.data.name !== undefined && { name: parsed.data.name }),
          ...(parsed.data.organiser !== undefined && { organiser: parsed.data.organiser }),
          roundCount: nextRoundCount,
          cardsPerRound: nextCardsPerRound,
        },
      });

      if (roundUpdatesByNumber.size > 0) {
        for (const [roundNumber, dueDate] of roundUpdatesByNumber.entries()) {
          await tx.round.updateMany({
            where: { competitionId, roundNumber },
            data: { dueDate: new Date(dueDate) },
          });
        }
      }

      const shouldAddScoreStubs = nextRoundCount > current.roundCount || nextCardsPerRound > current.cardsPerRound;
      if (shouldAddScoreStubs) {
        const entries = await tx.competitionEntry.findMany({
          where: { competitionId },
          select: { userId: true },
        });
        if (entries.length > 0) {
          const rounds = await tx.round.findMany({
            where: { competitionId, roundNumber: { lte: nextRoundCount } },
            select: { id: true, roundNumber: true },
            orderBy: { roundNumber: 'asc' },
          });

          const scoreStubs: { competitionId: string; roundId: string; userId: string; cardNumber: number }[] = [];

          if (nextCardsPerRound > current.cardsPerRound) {
            const existingRounds = rounds.filter(r => r.roundNumber <= Math.min(current.roundCount, nextRoundCount));
            for (const { userId } of entries) {
              for (const round of existingRounds) {
                for (let card = current.cardsPerRound + 1; card <= nextCardsPerRound; card++) {
                  scoreStubs.push({ competitionId, roundId: round.id, userId, cardNumber: card });
                }
              }
            }
          }

          if (nextRoundCount > current.roundCount) {
            const newRounds = rounds.filter(r => r.roundNumber > current.roundCount);
            for (const { userId } of entries) {
              for (const round of newRounds) {
                for (let card = 1; card <= nextCardsPerRound; card++) {
                  scoreStubs.push({ competitionId, roundId: round.id, userId, cardNumber: card });
                }
              }
            }
          }

          if (scoreStubs.length > 0) {
            await tx.score.createMany({ data: scoreStubs, skipDuplicates: true });
          }
        }
      }
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === 'Competition not found') {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e.message.includes('Cannot reduce') || e.message.includes('Due date is required')) {
        res.status(409).json({ error: e.message });
        return;
      }
      if (e.message.includes('roundNumber outside the target roundCount') || e.message.includes('Duplicate roundNumber')) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ error: 'A competition with that name already exists in this season' });
      return;
    }
    throw e;
  }

  const updated = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  });
  res.json(updated);
});

router.delete('/clubs/:clubId/scoring/competitions/:competitionId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const comp = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
    select: { id: true },
  });
  if (!comp) { res.status(404).json({ error: 'Competition not found' }); return; }

  await prisma.competition.delete({ where: { id: competitionId } });
  res.status(204).end();
});

router.delete('/clubs/:clubId/scoring/competitions/:competitionId/rounds/:roundNumber', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const roundNumber = Number(req.params.roundNumber);
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    res.status(400).json({ error: 'Invalid round number' });
    return;
  }

  const comp = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
    select: { id: true, roundCount: true },
  });
  if (!comp) { res.status(404).json({ error: 'Competition not found' }); return; }
  if (comp.roundCount <= 1) {
    res.status(400).json({ error: 'Competition must have at least one round' });
    return;
  }
  if (roundNumber !== comp.roundCount) {
    res.status(400).json({ error: 'Only the final round can be deleted' });
    return;
  }

  const targetRound = await prisma.round.findFirst({
    where: { competitionId, roundNumber },
    select: { id: true },
  });
  if (!targetRound) { res.status(404).json({ error: 'Round not found' }); return; }

  const scoreCount = await prisma.score.count({
    where: { roundId: targetRound.id, score: { not: null } },
  });
  if (scoreCount > 0) {
    res.status(409).json({ error: 'Cannot delete round with scores already recorded' });
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.score.deleteMany({ where: { roundId: targetRound.id } });
    await tx.round.delete({ where: { id: targetRound.id } });
    await tx.competition.update({
      where: { id: competitionId },
      data: { roundCount: { decrement: 1 } },
    });
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/competitions/:competitionId/members', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId, competition: { clubId } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(entries);
});

router.post('/clubs/:clubId/scoring/competitions/:competitionId/members', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = enrolMembersSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  const comp = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  });
  if (!comp) { res.status(404).json({ error: 'Competition not found' }); return; }

  // Verify all userIds are approved members of this club
  const memberships = await prisma.clubMembership.findMany({
    where: {
      clubId,
      userId: { in: parsed.data.userIds },
      status: MembershipStatus.APPROVED,
    },
    select: { userId: true },
  });
  const validUserIds = new Set(memberships.map(m => m.userId));
  const invalid = parsed.data.userIds.filter(uid => !validUserIds.has(uid));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Users not approved members: ${invalid.join(', ')}` });
    return;
  }

  // Find already-enrolled users to skip them
  const existing = await prisma.competitionEntry.findMany({
    where: { competitionId, userId: { in: parsed.data.userIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map(e => e.userId));
  const newUserIds = parsed.data.userIds.filter(uid => !existingSet.has(uid));

  if (newUserIds.length === 0) {
    res.status(200).json({ enrolled: 0 });
    return;
  }

  await prisma.$transaction(async tx => {
    // Create entries
    await tx.competitionEntry.createMany({
      data: newUserIds.map(userId => ({ competitionId, userId })),
    });

    // Create Score stubs for each new member × each round × each card
    const scoreStubs: { competitionId: string; roundId: string; userId: string; cardNumber: number }[] = [];
    for (const userId of newUserIds) {
      for (const round of comp.rounds) {
        for (let card = 1; card <= comp.cardsPerRound; card++) {
          scoreStubs.push({ competitionId, roundId: round.id, userId, cardNumber: card });
        }
      }
    }
    await tx.score.createMany({ data: scoreStubs });
  });

  res.status(201).json({ enrolled: newUserIds.length });
});

router.delete('/clubs/:clubId/scoring/competitions/:competitionId/members/:userId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const userId = req.params.userId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const entry = await prisma.competitionEntry.findFirst({
    where: { competitionId, userId, competition: { clubId } },
    select: { id: true },
  });
  if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }

  // Only allow removal if no scores have been entered
  const scoreCount = await prisma.score.count({
    where: { competitionId, userId, score: { not: null } },
  });
  if (scoreCount > 0) {
    res.status(409).json({ error: 'Cannot remove member with scores already recorded' });
    return;
  }

  await prisma.$transaction(async tx => {
    await tx.score.deleteMany({ where: { competitionId, userId } });
    await tx.competitionEntry.delete({ where: { id: entry.id } });
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Score sheet (read)
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/competitions/:competitionId/scoresheet', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const competitionId = req.params.competitionId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const comp = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          scores: {
            orderBy: [{ userId: 'asc' }, { cardNumber: 'asc' }],
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      entries: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!comp) { res.status(404).json({ error: 'Competition not found' }); return; }

  res.json({
    competition: {
      id: comp.id,
      name: comp.name,
      organiser: comp.organiser,
      roundCount: comp.roundCount,
      cardsPerRound: comp.cardsPerRound,
    },
    members: comp.entries.map(e => ({ id: e.user.id, name: e.user.name, email: e.user.email })),
    rounds: comp.rounds.map(r => ({
      id: r.id,
      roundNumber: r.roundNumber,
      dueDate: r.dueDate,
      scores: r.scores.map(s => ({
        id: s.id,
        userId: s.userId,
        cardNumber: s.cardNumber,
        score: s.score,
      })),
    })),
  });
});

// ---------------------------------------------------------------------------
// Score autosave (single cell)
// ---------------------------------------------------------------------------

router.patch('/clubs/:clubId/scoring/scores/:scoreId', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const scoreId = req.params.scoreId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = updateScoreSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }

  const existing = await prisma.score.findFirst({
    where: { id: scoreId, competition: { clubId } },
    select: { id: true, competitionId: true },
  });
  if (!existing) { res.status(404).json({ error: 'Score not found' }); return; }

  const updated = await prisma.score.update({
    where: { id: scoreId },
    data: { score: parsed.data.score },
  });

  res.json(updated);
});

// ---------------------------------------------------------------------------
// Averages report (admin)
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/report', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
  if (!isAdmin) { res.status(403).json({ error: 'Forbidden' }); return; }

  const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
  const competitionId = typeof req.query.competitionId === 'string' ? req.query.competitionId : undefined;
  const format = typeof req.query.format === 'string' ? req.query.format : undefined;

  // Raw score export for a single season
  if (format === 'raw-csv') {
    if (!seasonId) {
      res.status(400).json({ error: 'seasonId is required for raw CSV export' });
      return;
    }

    let csv: string;
    let seasonName: string;
    try {
      const result = await buildRawSeasonCompetitionResultsCsv({
        clubId,
        seasonId,
        competitionId,
      });
      csv = result.csv;
      seasonName = result.seasonName;
    } catch (error) {
      if (error instanceof Error && error.message === 'SEASON_NOT_FOUND') {
        res.status(404).json({ error: 'Season not found' });
        return;
      }
      throw error;
    }

    const safeSeason = seasonName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'season';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="raw-scores-${safeSeason}.csv"`);
    res.send(csv);
    return;
  }

  // Get all approved members of the club
  const memberships = await prisma.clubMembership.findMany({
    where: { clubId, status: MembershipStatus.APPROVED },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  });

  const memberUserIds = memberships.map(m => m.userId);

  // Fetch all scores for all members in one query, ordered by updatedAt desc (needed for last-10)
  const allScoreRows = await prisma.score.findMany({
    where: {
      userId: { in: memberUserIds },
      competition: {
        clubId,
        ...(seasonId && { seasonId }),
        ...(competitionId && { id: competitionId }),
      },
      score: { not: null },
    },
    select: { score: true, userId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  // Group scores by userId (already desc by updatedAt, preserving order for last-10)
  const scoresByUser = new Map<string, number[]>();
  for (const row of allScoreRows) {
    if (row.userId == null) continue;
    const arr = scoresByUser.get(row.userId);
    if (arr) {
      arr.push(row.score as number);
    } else {
      scoresByUser.set(row.userId, [row.score as number]);
    }
  }

  const results = memberships.map(m => {
    const values = scoresByUser.get(m.userId) ?? [];
    const allTimeAvg = values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
    const last10 = values.slice(0, 10);
    const last10Avg = last10.length > 0
      ? last10.reduce((a, b) => a + b, 0) / last10.length
      : null;
    const bestScore = values.length > 0 ? Math.max(...values) : null;

    return {
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      totalCardsShot: values.length,
      allTimeAverage: allTimeAvg !== null ? Math.round(allTimeAvg * 100) / 100 : null,
      last10Average: last10Avg !== null ? Math.round(last10Avg * 100) / 100 : null,
      bestScore,
    };
  });

  if (format === 'csv') {
    const headers = ['Name', 'Email', 'Total Cards Shot', 'All-Time Average', 'Last 10 Average', 'Best Score'];
    const rows = results.map(r => [
      escapeCsvCell(r.name),
      escapeCsvCell(r.email),
      escapeCsvCell(r.totalCardsShot),
      escapeCsvCell(r.allTimeAverage ?? ''),
      escapeCsvCell(r.last10Average ?? ''),
      escapeCsvCell(r.bestScore ?? ''),
    ].join(','));

    const csv = [headers.map(h => escapeCsvCell(h)).join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="scores-report.csv"');
    res.send(csv);
    return;
  }

  res.json(results);
});

// ---------------------------------------------------------------------------
// Member-facing: due cards + averages
// ---------------------------------------------------------------------------

router.get('/clubs/:clubId/scoring/mine/due', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const userId = req.user!.id;

  const isMember = await ensureMemberOfClub(userId, clubId);
  if (!isMember) { res.status(403).json({ error: 'Forbidden' }); return; }

  // Cards due: score IS NULL, dueDate within [-7d, +60d] window from today
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const scores = await prisma.score.findMany({
    where: {
      userId,
      score: null,
      competition: { clubId },
      round: { dueDate: { gte: sevenDaysAgo, lte: sevenDaysFromNow } },
    },
    include: {
      competition: { select: { id: true, name: true} },
      round: { select: { id: true, roundNumber: true, dueDate: true } },
    },
    orderBy: { round: { dueDate: 'asc' } },
  });
  res.json(scores.map(s => ({
    scoreId: s.id,
    competitionId: s.competitionId,
    competitionName: s.competition?.name,
    roundId: s.roundId,
    roundNumber: s.round?.roundNumber,
    dueDate: s.round?.dueDate,
    cardNumber: s.cardNumber,
  })));
});

router.get('/clubs/:clubId/scoring/mine/averages', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const userId = req.user!.id;

  const isMember = await ensureMemberOfClub(userId, clubId);
  if (!isMember) { res.status(403).json({ error: 'Forbidden' }); return; }

  const allScores = await prisma.score.findMany({
    where: {
      userId,
      score: { not: null },
      competition: { clubId },
    },
    select: { score: true },
    orderBy: { updatedAt: 'desc' },
  });

  const values = allScores.map(s => s.score as number);
  const allTimeAvg = values.length > 0
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    : null;
  const last10 = values.slice(0, 10);
  const last10Avg = last10.length > 0
    ? Math.round((last10.reduce((a, b) => a + b, 0) / last10.length) * 100) / 100
    : null;

  res.json({ allTimeAverage: allTimeAvg, last10Average: last10Avg, totalCardsShot: values.length });
});

router.get('/clubs/:clubId/scoring/mine/recent', async (req: AuthRequest, res: Response) => {
  const clubId = req.params.clubId as string;
  const userId = req.user!.id;

  const isMember = await ensureMemberOfClub(userId, clubId);
  if (!isMember) { res.status(403).json({ error: 'Forbidden' }); return; }

  const scores = await prisma.score.findMany({
    where: {
      userId,
      score: { not: null },
      competition: { clubId },
    },
    include: {
      competition: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  res.json(scores.map(s => ({
    scoreId: s.id,
    competitionId: s.competitionId,
    competitionName: s.competition.name,
    score: s.score,
    scoredAt: s.updatedAt,
  })));
});

export default router;
