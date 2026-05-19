import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AdminRole, CompetitionFormat, CompetitionType, Prisma } from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import { suggestDivisions, DivisionEntry } from '../utils/competitionSetup';

const router = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createCompetitionEventSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  format: z.nativeEnum(CompetitionFormat),
  type: z.nativeEnum(CompetitionType),
  owningClubId: z.string().min(1).optional().nullable(),
  owningUserId: z.string().min(1).optional().nullable(),
});

const suggestDivisionsSchema = z.object({
  format: z.nativeEnum(CompetitionFormat),
  targetDivisionSize: z.number().int().min(2).max(32).default(8),
  entries: z.array(
    z.object({
      id: z.string().optional(),
      displayName: z.string().trim().min(1),
      declaredAverage: z.number().min(0),
      clubId: z.string().optional().nullable(),
      userId: z.string().optional().nullable(),
    }),
  ).min(1),
});

const finalizeDivisionsSchema = z.object({
  format: z.nativeEnum(CompetitionFormat),
  type: z.nativeEnum(CompetitionType),
  divisions: z.array(
    z.object({
      name: z.string().trim().min(1),
      participants: z.array(
        z.object({
          displayName: z.string().trim().min(1),
          declaredAverage: z.number().min(0),
          clubId: z.string().optional().nullable(),
          userId: z.string().optional().nullable(),
          isBogey: z.boolean().default(false),
          bogeyScore: z.number().int().min(0).optional().nullable(),
        }),
      ).min(1),
    }),
  ).min(1),
  rounds: z.array(
    z.object({
      name: z.string().trim().min(1),
      deadline: z.string().datetime({ offset: true }).or(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(v => `${v}T00:00:00.000Z`),
      ),
    }),
  ).min(1),
});

const submitMatchScoreSchema = z.object({
  userId: z.string().min(1).optional().nullable(),
  unregisteredName: z.string().trim().min(1).optional().nullable(),
  rawScore: z.number().int().min(0).max(100000),
  submittedByClubId: z.string().min(1).optional().nullable(),
}).refine(
  data => data.userId || data.unregisteredName,
  { message: 'Either userId or unregisteredName must be provided' },
);

// ---------------------------------------------------------------------------
// Helper: check if user is an admin/editor of a competition event
// ---------------------------------------------------------------------------

async function ensureCompetitionAdmin(
  userId: string,
  competitionId: string,
  minRole: AdminRole = AdminRole.EDITOR,
): Promise<boolean> {
  const admin = await prisma.competitionAdmin.findFirst({
    where: { competitionId, userId },
    select: { role: true },
  });
  if (!admin) return false;
  if (minRole === AdminRole.OWNER) return admin.role === AdminRole.OWNER;
  return true; // EDITOR or OWNER both satisfy EDITOR requirement
}

// ---------------------------------------------------------------------------
// POST /api/competition-events — Create a new competition event
// ---------------------------------------------------------------------------

router.post('/competition-events', async (req: AuthRequest, res: Response) => {
  const parsed = createCompetitionEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const userId = req.user!.id;
  const { name, format, type, owningClubId, owningUserId } = parsed.data;

  const event = await prisma.$transaction(async tx => {
    const created = await tx.competitionEvent.create({
      data: {
        name,
        format,
        type,
        owningClubId: owningClubId ?? null,
        owningUserId: owningUserId ?? null,
      },
    });

    await tx.competitionAdmin.create({
      data: {
        competitionId: created.id,
        userId,
        role: AdminRole.OWNER,
      },
    });

    return created;
  });

  res.status(201).json(event);
});

// ---------------------------------------------------------------------------
// GET /api/competition-events — List events the user administers
// ---------------------------------------------------------------------------

router.get('/competition-events', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const events = await prisma.competitionEvent.findMany({
    where: {
      admins: { some: { userId } },
    },
    include: {
      admins: { where: { userId }, select: { role: true } },
      _count: { select: { divisions: true, rounds: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(events);
});

// ---------------------------------------------------------------------------
// GET /api/competition-events/:id — Get a single competition event with full detail
// ---------------------------------------------------------------------------

router.get('/competition-events/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const id = req.params.id as string;

  const event = await prisma.competitionEvent.findUnique({
    where: { id },
    include: {
      admins: { include: { user: { select: { id: true, name: true, email: true } } } },
      divisions: {
        include: {
          participants: {
            include: {
              club: { select: { id: true, name: true } },
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      rounds: {
        include: {
          matches: {
            include: {
              homeParticipant: true,
              awayParticipant: true,
              scores: true,
            },
          },
        },
        orderBy: { deadline: 'asc' },
      },
    },
  });

  if (!event) {
    res.status(404).json({ error: 'Competition not found' });
    return;
  }

  // Must be admin to view detail
  const isAdmin = event.admins.some(a => a.userId === userId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.json(event);
});

// ---------------------------------------------------------------------------
// POST /api/competition-events/suggest-divisions — Calculate division suggestions
// ---------------------------------------------------------------------------

router.post('/competition-events/suggest-divisions', async (req: AuthRequest, res: Response) => {
  const parsed = suggestDivisionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { entries, targetDivisionSize, format } = parsed.data;
  const divisions = suggestDivisions(entries as DivisionEntry[], targetDivisionSize, format);
  res.json(divisions);
});

// ---------------------------------------------------------------------------
// POST /api/competition-events/:id/finalize — Bulk-create divisions, participants, rounds, matches
// ---------------------------------------------------------------------------

router.post('/competition-events/:id/finalize', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user!.id;

  const isAdmin = await ensureCompetitionAdmin(userId, id, AdminRole.OWNER);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: OWNER role required' });
    return;
  }

  const parsed = finalizeDivisionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const event = await prisma.competitionEvent.findUnique({
    where: { id },
    select: { id: true, format: true },
  });
  if (!event) {
    res.status(404).json({ error: 'Competition not found' });
    return;
  }

  const { divisions: divisionPayload, rounds: roundPayload, format } = parsed.data;

  const result = await prisma.$transaction(async tx => {
    // Remove any existing divisions/rounds (re-finalize scenario)
    await tx.competitionDivision.deleteMany({ where: { competitionId: id } });
    await tx.competitionRound.deleteMany({ where: { competitionId: id } });

    // Create divisions and participants
    const createdDivisions = [];
    for (const div of divisionPayload) {
      const division = await tx.competitionDivision.create({
        data: {
          competitionId: id,
          name: div.name,
          participants: {
            create: div.participants.map(p => ({
              displayName: p.displayName,
              declaredAverage: p.declaredAverage,
              clubId: p.clubId ?? null,
              userId: p.userId ?? null,
              isBogey: p.isBogey,
              bogeyScore: p.bogeyScore ?? null,
            })),
          },
        },
        include: { participants: true },
      });
      createdDivisions.push(division);
    }

    // Create rounds
    const createdRounds = [];
    for (const round of roundPayload) {
      const competitionRound = await tx.competitionRound.create({
        data: {
          competitionId: id,
          name: round.name,
          deadline: new Date(round.deadline),
        },
      });
      createdRounds.push(competitionRound);
    }

    // Generate matches: round-robin within each division for LEAGUE; single-pairing for KNOCKOUT
    const allMatches = [];
    for (const division of createdDivisions) {
      const participants = division.participants;
      const pairs: Array<{ homeParticipantId: string; awayParticipantId: string }> = [];

      if (format === CompetitionFormat.LEAGUE) {
        // Generate round-robin pairs (each pair plays once)
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            pairs.push({
              homeParticipantId: participants[i].id,
              awayParticipantId: participants[j].id,
            });
          }
        }
      } else {
        // KNOCKOUT: pair consecutive participants (1v2, 3v4, etc.)
        for (let i = 0; i + 1 < participants.length; i += 2) {
          pairs.push({
            homeParticipantId: participants[i].id,
            awayParticipantId: participants[i + 1].id,
          });
        }
      }

      // Distribute pairs across rounds (round-robin distribution)
      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        const round = createdRounds[pairIdx % createdRounds.length];
        const match = await tx.competitionMatch.create({
          data: {
            roundId: round.id,
            homeParticipantId: pairs[pairIdx].homeParticipantId,
            awayParticipantId: pairs[pairIdx].awayParticipantId,
          },
        });
        allMatches.push(match);
      }
    }

    return { divisions: createdDivisions, rounds: createdRounds, matchCount: allMatches.length };
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------------
// GET /api/competition-events/:id/matches/:matchId — Get a single match with scores
// ---------------------------------------------------------------------------

router.get('/competition-events/:id/matches/:matchId', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const matchId = req.params.matchId as string;
  const userId = req.user!.id;

  const isAdmin = await ensureCompetitionAdmin(userId, id);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const match = await prisma.competitionMatch.findFirst({
    where: {
      id: matchId,
      round: { competitionId: id },
    },
    include: {
      homeParticipant: {
        include: {
          club: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
      awayParticipant: {
        include: {
          club: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
      scores: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      round: { select: { id: true, name: true, deadline: true } },
    },
  });

  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  res.json(match);
});

// ---------------------------------------------------------------------------
// POST /api/competition-events/:id/matches/:matchId/scores — Submit a score
// ---------------------------------------------------------------------------

router.post(
  '/competition-events/:id/matches/:matchId/scores',
  async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const matchId = req.params.matchId as string;
    const requestingUserId = req.user!.id;

    const isAdmin = await ensureCompetitionAdmin(requestingUserId, id);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const parsed = submitMatchScoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }

    // Verify match belongs to this competition
    const match = await prisma.competitionMatch.findFirst({
      where: { id: matchId, round: { competitionId: id } },
      select: { id: true },
    });
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { userId, unregisteredName, rawScore, submittedByClubId } = parsed.data;

    let dbUserId: string | null = null;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      dbUserId = user.id;
    }

    const score = await prisma.score.create({
      data: {
        matchId,
        userId: dbUserId,
        unregisteredName: unregisteredName ?? null,
        rawScore,
        cardNumber: 1,
        submittedByClubId: submittedByClubId ?? null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(score);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/competition-events/:id/scores/:scoreId — Remove a score
// ---------------------------------------------------------------------------

router.delete(
  '/competition-events/:id/scores/:scoreId',
  async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const scoreId = req.params.scoreId as string;
    const userId = req.user!.id;

    const isAdmin = await ensureCompetitionAdmin(userId, id);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const score = await prisma.score.findFirst({
      where: { id: scoreId, match: { round: { competitionId: id } } },
      select: { id: true },
    });
    if (!score) {
      res.status(404).json({ error: 'Score not found' });
      return;
    }

    await prisma.score.delete({ where: { id: scoreId as string } });
    res.status(204).end();
  },
);

export default router;
