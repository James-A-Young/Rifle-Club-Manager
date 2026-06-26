import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  const firearms = await prisma.firearm.findMany({
    where: { userId: req.user!.id, deletedAt: null },
  });
  res.json(firearms);
});

export default router;
