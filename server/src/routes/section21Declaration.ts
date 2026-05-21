import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { formatZodError } from '../utils/zodError';
import { ensureAdminForClub } from '../utils/clubAccess';
import { prisma } from '../prisma';
import {
  submitDeclaration,
  getCurrentDeclaration,
  getDeclarationHistory,
  getDeclarationStatus,
  getDeclarationForAdminView,
  generateDeclarationText,
} from '../services/section21Declaration';

const router = Router();

// Submit a new Section 21 declaration
router.post('/users/me/section21-declaration', requireAuth, async (req: AuthRequest, res: Response) => {
  const submitSchema = z.object({
    fullLegalName: z.string().min(1, 'Full legal name is required').max(255),
  });

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  try {
    // Check if user already has a valid (not expired) declaration
    const status = await getDeclarationStatus(req.user!.id);
    if (status === 'SIGNED') {
      res.status(409).json({ error: 'You have already signed a valid declaration' });
      return;
    }

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const declaration = await submitDeclaration(
      req.user!.id,
      parsed.data.fullLegalName,
      ipAddress,
      userAgent,
    );

    res.status(201).json({
      id: declaration.id,
      status: declaration.status,
      fullLegalName: declaration.fullLegalName,
      signedDate: declaration.signedDate,
      nextDueDate: declaration.nextDueDate,
      createdAt: declaration.createdAt,
    });
  } catch (err) {
    console.error('Error submitting Section 21 declaration:', err);
    res.status(500).json({ error: 'Failed to submit declaration' });
  }
});

// Get current Section 21 declaration for authenticated user
router.get('/users/me/section21-declaration', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const declaration = await getCurrentDeclaration(req.user!.id);
    if (!declaration) {
      res.json(null);
      return;
    }

    res.json({
      id: declaration.id,
      status: declaration.status,
      fullLegalName: declaration.fullLegalName,
      signedDate: declaration.signedDate,
      signedTimestamp: declaration.signedTimestamp,
      ipAddress: declaration.ipAddress,
      userAgent: declaration.userAgent,
      declarationText:
        declaration.declarationText && declaration.declarationText.trim().length > 0
          ? declaration.declarationText
          : generateDeclarationText(),
      nextDueDate: declaration.nextDueDate,
      createdAt: declaration.createdAt,
    });
  } catch (err) {
    console.error('Error fetching current Section 21 declaration:', err);
    res.status(500).json({ error: 'Failed to fetch declaration' });
  }
});

// Get paginated declaration history for authenticated user
router.get('/users/me/section21-declarations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const offsetParam = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const limit = Math.min(Math.max(1, limitParam), 100); // Clamp between 1 and 100
    const offset = Math.max(0, offsetParam);

    const { declarations, total } = await getDeclarationHistory(req.user!.id, limit, offset);

    res.json({
      data: declarations,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (err) {
    console.error('Error fetching Section 21 declaration history:', err);
    res.status(500).json({ error: 'Failed to fetch declaration history' });
  }
});

// Get a specific Section 21 declaration by ID with full details
router.get('/users/me/section21-declarations/:declarationId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const declarationId = req.params.declarationId as string;

    const declaration = await prisma.section21Declaration.findFirst({
      where: {
        id: declarationId,
        userId: req.user!.id,
      },
    });

    if (!declaration) {
      res.status(404).json({ error: 'Declaration not found' });
      return;
    }

    res.json({
      id: declaration.id,
      status: declaration.status,
      fullLegalName: declaration.fullLegalName,
      signedDate: declaration.signedDate,
      signedTimestamp: declaration.signedTimestamp,
      ipAddress: declaration.ipAddress,
      userAgent: declaration.userAgent,
      declarationText: declaration.declarationText,
      nextDueDate: declaration.nextDueDate,
      createdAt: declaration.createdAt,
    });
  } catch (err) {
    console.error('Error fetching Section 21 declaration:', err);
    res.status(500).json({ error: 'Failed to fetch declaration' });
  }
});

// Get Section 21 declaration status for authenticated user
router.get('/users/me/section21-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const status = await getDeclarationStatus(req.user!.id);
    res.json({ status });
  } catch (err) {
    console.error('Error fetching Section 21 declaration status:', err);
    res.status(500).json({ error: 'Failed to fetch declaration status' });
  }
});

// Admin endpoint: Get a member's Section 21 declaration (with masked IP)
router.get(
  '/clubs/:clubId/members/:userId/section21-declaration',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const clubId = req.params.clubId as string;
      const userId = req.params.userId as string;

      // Verify requester is admin of the club
      const isAdmin = await ensureAdminForClub(req.user!.id, clubId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Not authorized to view member declarations' });
        return;
      }

      const declaration = await getDeclarationForAdminView(userId);
      if (!declaration) {
        res.json(null);
        return;
      }

      res.json({
        id: declaration.id,
        status: declaration.status,
        fullLegalName: declaration.fullLegalName,
        signedDate: declaration.signedDate,
        signedTimestamp: declaration.signedTimestamp,
        maskedIpAddress: declaration.maskedIpAddress,
        userAgent: declaration.userAgent,
        declarationText: declaration.declarationText,
        nextDueDate: declaration.nextDueDate,
        createdAt: declaration.createdAt,
      });
    } catch (err) {
      console.error('Error fetching member Section 21 declaration:', err);
      res.status(500).json({ error: 'Failed to fetch member declaration' });
    }
  },
);

export default router;
