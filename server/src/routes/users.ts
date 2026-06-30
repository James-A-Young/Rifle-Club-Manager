import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  OwnerType,
  MembershipStatus,
  MembershipCardAverageMetric,
  Gender,
  DisabilityStatus,
} from '@prisma/client';
import { formatZodError } from '../utils/zodError';
import { googleWalletService, CreatePassParams } from '../services/googleWallet';
import { recordUserProfileHistoryChange, TrackedProfile } from '../services/profileHistory';
import { getDeclarationStatus } from '../services/section21Declaration';
import {
  decryptStoredTwoFactorSecret,
  encryptStoredTwoFactorSecret,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from '../services/twoFactor';

const router = Router();
const EMAIL_VERIFICATION_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

router.use(requireAuth);

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerifiedAt: true,
      twoFactorEnabled: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
      gender: true,
      disabilityStatus: true,
      guardianDeclarationAccepted: true,
      guardianFullName: true,
      guardianPhoneNumber: true,
      guardianDeclarationAt: true,
      emergencyContactName: true,
      emergencyContactRelation: true,
      emergencyContactPhoneNumber: true,
      phoneNumber: true,
      firearmCertificateNumber: true,
      firearmCertificateExpiry: true,
      shotgunCertificateNumber: true,
      shotgunCertificateExpiry: true,
      gdprConsentDate: true,
      section21DeclarationSignedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Get current declaration status
  const section21Status = await getDeclarationStatus(req.user!.id);

  res.json({
    ...user,
    emailVerificationRequiredBy:
      user.emailVerifiedAt || !process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()
        ? null
        : new Date(user.createdAt.getTime() + EMAIL_VERIFICATION_GRACE_PERIOD_MS),
    section21Status,
  });
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  placeOfBirth: z.string().min(2).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.nativeEnum(Gender).optional(),
  disabilityStatus: z.nativeEnum(DisabilityStatus).optional(),
  guardianDeclarationAccepted: z.boolean().optional(),
  guardianFullName: z.string().optional().nullable(),
  guardianPhoneNumber: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
  emergencyContactPhoneNumber: z.string().optional().nullable(),
  phoneNumber: z.string().min(1).optional(),
  firearmCertificateNumber: z.string().optional().nullable(),
  firearmCertificateExpiry: z.string().optional().nullable(),
  shotgunCertificateNumber: z.string().optional().nullable(),
  shotgunCertificateExpiry: z.string().optional().nullable(),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeFriendlyName(value: string | null | undefined): string | null {
  return normalizeOptionalText(value);
}

function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field}`);
  }
  return parsed;
}

function isUnder18(dateOfBirth: Date): boolean {
  const now = new Date();
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age < 18;
}

type ScoreSample = {
  score: number;
  scoredAt: Date;
};

function normalizeDiscipline(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function scoreStats(samples: ScoreSample[]): { allTime: number | null; last10: number | null } {
  if (samples.length === 0) {
    return { allTime: null, last10: null };
  }
  const sorted = [...samples].sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime());
  const allValues = sorted.map(s => s.score);
  const allTime = allValues.reduce((sum, value) => sum + value, 0) / allValues.length;
  const last10Values = allValues.slice(0, 10);
  const last10 = last10Values.reduce((sum, value) => sum + value, 0) / last10Values.length;
  return { allTime, last10 };
}

function metricLabel(metric: MembershipCardAverageMetric, discipline: string | null): string {
  switch (metric) {
    case MembershipCardAverageMetric.OVERALL_ALL_TIME:
      return 'Overall Avg';
    case MembershipCardAverageMetric.OVERALL_LAST_10:
      return 'Overall Last 10';
    case MembershipCardAverageMetric.COMPETITION_ALL_TIME:
      return 'Competition Avg';
    case MembershipCardAverageMetric.COMPETITION_LAST_10:
      return 'Competition Last 10';
    case MembershipCardAverageMetric.PRACTICE_ALL_TIME:
      return 'Practice Avg';
    case MembershipCardAverageMetric.PRACTICE_LAST_10:
      return 'Practice Last 10';
    case MembershipCardAverageMetric.DISCIPLINE_ALL_TIME:
      return `${discipline ?? 'Discipline'} Avg`;
    case MembershipCardAverageMetric.DISCIPLINE_LAST_10:
      return `${discipline ?? 'Discipline'} Last 10`;
    default:
      return 'Average';
  }
}

router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  let firearmCertificateExpiry: Date | null = null;
  let shotgunCertificateExpiry: Date | null = null;
  try {
    firearmCertificateExpiry = parseOptionalDate(parsed.data.firearmCertificateExpiry, 'firearm certificate expiry date');
    shotgunCertificateExpiry = parseOptionalDate(parsed.data.shotgunCertificateExpiry, 'shotgun certificate expiry date');
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid certificate expiry date' });
    return;
  }

  const {
    dateOfBirth,
    gender,
    disabilityStatus,
    guardianDeclarationAccepted,
    guardianFullName,
    guardianPhoneNumber,
    emergencyContactName,
    emergencyContactRelation,
    emergencyContactPhoneNumber,
    firearmCertificateNumber,
    shotgunCertificateNumber,
  } = parsed.data;

  const existingUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      name: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
      gender: true,
      disabilityStatus: true,
      guardianDeclarationAccepted: true,
      guardianFullName: true,
      guardianPhoneNumber: true,
      guardianDeclarationAt: true,
      emergencyContactName: true,
      emergencyContactRelation: true,
      emergencyContactPhoneNumber: true,
      phoneNumber: true,
      firearmCertificateNumber: true,
      firearmCertificateExpiry: true,
      shotgunCertificateNumber: true,
      shotgunCertificateExpiry: true,
    },
  });
  if (!existingUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const nextDateOfBirth = dateOfBirth ? new Date(dateOfBirth) : existingUser.dateOfBirth;
  if (Number.isNaN(nextDateOfBirth.getTime())) {
    res.status(400).json({ error: 'Invalid date of birth' });
    return;
  }

  const nextGuardianDeclarationAccepted =
    ('guardianDeclarationAccepted' in parsed.data)
      ? guardianDeclarationAccepted === true
      : existingUser.guardianDeclarationAccepted;
  const nextGuardianFullName =
    ('guardianFullName' in parsed.data)
      ? normalizeOptionalText(guardianFullName)
      : existingUser.guardianFullName;
  const nextGuardianPhoneNumber =
    ('guardianPhoneNumber' in parsed.data)
      ? normalizeOptionalText(guardianPhoneNumber)
      : existingUser.guardianPhoneNumber;

  if (isUnder18(nextDateOfBirth)) {
    if (!nextGuardianDeclarationAccepted) {
      res.status(400).json({ error: 'Parent or guardian declaration is required for members under 18' });
      return;
    }
    if (!nextGuardianFullName) {
      res.status(400).json({ error: 'Parent or guardian full name is required for members under 18' });
      return;
    }
    if (!nextGuardianPhoneNumber) {
      res.status(400).json({ error: 'Parent or guardian phone number is required for members under 18' });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(('name' in parsed.data) ? { name: parsed.data.name } : {}),
      ...(('address' in parsed.data) ? { address: parsed.data.address } : {}),
      ...(('placeOfBirth' in parsed.data) ? { placeOfBirth: parsed.data.placeOfBirth } : {}),
      ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
      ...(('gender' in parsed.data) ? { gender } : {}),
      ...(('disabilityStatus' in parsed.data) ? { disabilityStatus } : {}),
      ...(('guardianDeclarationAccepted' in parsed.data)
        ? {
          guardianDeclarationAccepted: guardianDeclarationAccepted === true,
          guardianDeclarationAt: guardianDeclarationAccepted === true ? new Date() : null,
        }
        : {}),
      ...(('guardianFullName' in parsed.data)
        ? { guardianFullName: normalizeOptionalText(guardianFullName) }
        : {}),
      ...(('guardianPhoneNumber' in parsed.data)
        ? { guardianPhoneNumber: normalizeOptionalText(guardianPhoneNumber) }
        : {}),
      ...(('emergencyContactName' in parsed.data)
        ? { emergencyContactName: normalizeOptionalText(emergencyContactName) }
        : {}),
      ...(('emergencyContactRelation' in parsed.data)
        ? { emergencyContactRelation: normalizeOptionalText(emergencyContactRelation) }
        : {}),
      ...(('emergencyContactPhoneNumber' in parsed.data)
        ? { emergencyContactPhoneNumber: normalizeOptionalText(emergencyContactPhoneNumber) }
        : {}),
      ...(('phoneNumber' in parsed.data) ? { phoneNumber: parsed.data.phoneNumber } : {}),
      ...(('firearmCertificateNumber' in parsed.data)
        ? { firearmCertificateNumber: normalizeOptionalText(firearmCertificateNumber) }
        : {}),
      ...(('firearmCertificateExpiry' in parsed.data)
        ? { firearmCertificateExpiry }
        : {}),
      ...(('shotgunCertificateNumber' in parsed.data)
        ? { shotgunCertificateNumber: normalizeOptionalText(shotgunCertificateNumber) }
        : {}),
      ...(('shotgunCertificateExpiry' in parsed.data)
        ? { shotgunCertificateExpiry }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      placeOfBirth: true,
      dateOfBirth: true,
      gender: true,
      disabilityStatus: true,
      guardianDeclarationAccepted: true,
      guardianFullName: true,
      guardianPhoneNumber: true,
      guardianDeclarationAt: true,
      emergencyContactName: true,
      emergencyContactRelation: true,
      emergencyContactPhoneNumber: true,
      phoneNumber: true,
      firearmCertificateNumber: true,
      firearmCertificateExpiry: true,
      shotgunCertificateNumber: true,
      shotgunCertificateExpiry: true,
      updatedAt: true,
    },
  });

  await recordUserProfileHistoryChange({
    userId: req.user!.id,
    changedByUserId: req.user!.id,
    previous: existingUser as TrackedProfile,
    next: {
      name: user.name,
      address: user.address,
      placeOfBirth: user.placeOfBirth,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      disabilityStatus: user.disabilityStatus,
      guardianDeclarationAccepted: user.guardianDeclarationAccepted,
      guardianFullName: user.guardianFullName,
      guardianPhoneNumber: user.guardianPhoneNumber,
      emergencyContactName: user.emergencyContactName,
      emergencyContactRelation: user.emergencyContactRelation,
      emergencyContactPhoneNumber: user.emergencyContactPhoneNumber,
      firearmCertificateNumber: user.firearmCertificateNumber,
      firearmCertificateExpiry: user.firearmCertificateExpiry,
      shotgunCertificateNumber: user.shotgunCertificateNumber,
      shotgunCertificateExpiry: user.shotgunCertificateExpiry,
    },
  });

  res.json(user);
});

const twoFactorCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

router.post('/me/2fa/setup/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, twoFactorEnabled: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.twoFactorEnabled) {
    res.status(409).json({ error: 'Two-factor authentication is already enabled' });
    return;
  }

  const { secret, otpauthUrl } = generateTwoFactorSecret(user.email);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorPendingSecret: encryptStoredTwoFactorSecret(secret),
      twoFactorPendingExpiresAt: expiresAt,
    },
  });

  res.json({
    otpauthUrl,
    manualKey: secret,
    expiresAt,
  });
});

router.post('/me/2fa/setup/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = twoFactorCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      twoFactorEnabled: true,
      twoFactorPendingSecret: true,
      twoFactorPendingExpiresAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.twoFactorEnabled) {
    res.status(409).json({ error: 'Two-factor authentication is already enabled' });
    return;
  }
  if (!user.twoFactorPendingSecret || !user.twoFactorPendingExpiresAt || user.twoFactorPendingExpiresAt < new Date()) {
    res.status(400).json({ error: '2FA setup session expired. Start setup again.' });
    return;
  }
  let pendingSecret: string;
  try {
    pendingSecret = decryptStoredTwoFactorSecret(user.twoFactorPendingSecret);
  } catch {
    res.status(400).json({ error: '2FA setup session expired. Start setup again.' });
    return;
  }

  if (!verifyTwoFactorCode(pendingSecret, parsed.data.code)) {
    res.status(400).json({ error: 'Invalid authenticator code' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: user.twoFactorPendingSecret,
      twoFactorPendingSecret: null,
      twoFactorPendingExpiresAt: null,
    },
  });

  res.json({ success: true });
});

router.get('/me/firearms', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearms = await prisma.firearm.findMany({
    where: { userId: req.user!.id, ownerType: OwnerType.USER, deletedAt: null },
    orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(firearms);
});

const firearmFavoriteSchema = z.object({
  isFavorite: z.boolean(),
});

const firearmSchema = z.object({
  friendlyName: z.string().max(120).optional().nullable(),
  make: z.string().min(1),
  model: z.string().min(1),
  caliber: z.string().min(1),
  serialNumber: z.string().min(1),
});

router.post('/me/firearms', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const firearm = await prisma.firearm.create({
    data: {
      make: parsed.data.make,
      model: parsed.data.model,
      caliber: parsed.data.caliber,
      serialNumber: parsed.data.serialNumber,
      friendlyName: normalizeFriendlyName(parsed.data.friendlyName),
      ownerType: OwnerType.USER,
      userId: req.user!.id,
    },
  });
  res.status(201).json(firearm);
});

router.delete('/me/firearms/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearmId = req.params.id as string;
  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, userId: req.user!.id, ownerType: OwnerType.USER, deletedAt: null },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }
  await prisma.firearm.update({
    where: { id: firearmId },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
});

router.patch('/me/firearms/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearmId = req.params.id as string;
  const parsed = firearmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, userId: req.user!.id, ownerType: OwnerType.USER, deletedAt: null },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }

  const updated = await prisma.firearm.update({
    where: { id: firearmId },
    data: {
      make: parsed.data.make,
      model: parsed.data.model,
      caliber: parsed.data.caliber,
      serialNumber: parsed.data.serialNumber,
      friendlyName: normalizeFriendlyName(parsed.data.friendlyName),
    },
  });

  res.json(updated);
});

router.patch('/me/firearms/:id/favorite', requireAuth, async (req: AuthRequest, res: Response) => {
  const firearmId = req.params.id as string;
  const parsed = firearmFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const firearm = await prisma.firearm.findFirst({
    where: { id: firearmId, userId: req.user!.id, ownerType: OwnerType.USER, deletedAt: null },
  });
  if (!firearm) {
    res.status(404).json({ error: 'Firearm not found' });
    return;
  }

  const updated = await prisma.firearm.update({
    where: { id: firearmId },
    data: { isFavorite: parsed.data.isFavorite },
  });

  res.json(updated);
});

// Google Wallet Membership Pass endpoints
async function handleMembershipPassStatusRequest(req: AuthRequest, res: Response) {
  const clubId = req.params.clubId as string;

  try {
    const membership = await prisma.clubMembership.findFirst({
      where: {
        userId: req.user!.id,
        clubId,
        status: MembershipStatus.APPROVED,
      },
      select: { id: true },
    });

    if (!membership) {
      res.json({ passIssuingEnabled: false });
      return;
    }

    const settings = await prisma.clubSettings.findUnique({
      where: { clubId },
      select: { passIssuingEnabled: true },
    });

    res.json({ passIssuingEnabled: Boolean(settings?.passIssuingEnabled) });
  } catch (error) {
    console.error('Error loading membership pass status:', error);
    res.status(500).json({ error: 'Failed to load membership pass status' });
  }
}

async function handleMembershipPassGenerateRequest(req: AuthRequest, res: Response) {
  const clubId = req.params.clubId as string;

  try {
    // Fetch current user with name
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true },
    });

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify user is a member of the club and it's approved
    const membership = await prisma.clubMembership.findFirst({
      where: {
        userId: req.user!.id,
        clubId,
        status: MembershipStatus.APPROVED,
      },
      include: { club: true },
    });

    if (!membership) {
      res.status(404).json({ error: 'Club membership not found or not approved' });
      return;
    }

    // Check if pass issuing is enabled
    const settings = await prisma.clubSettings.findUnique({
      where: { clubId },
    });

    if (!settings?.passIssuingEnabled) {
      res.status(403).json({ error: 'Pass issuing is not enabled for this club' });
      return;
    }


    // Get visitor count this year
    const currentYear = new Date().getFullYear();
    const visitCount = await prisma.visitLog.count({
      where: {
        userId: req.user!.id,
        clubId,
        timeIn: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31T23:59:59Z`),
        },
      },
    });

    // get total ammunition for year
    const roundsThisYear = await prisma.ammunitionSale.aggregate({
      where: {
        buyerUserId: req.user!.id,
        clubId,
        createdAt: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31T23:59:59Z`),
        },
      },
      _sum: {
        quantity: true,
      },
    });
    
    const competitionRows = await prisma.score.findMany({
      where: {
        userId: req.user!.id,
        score: { not: null },
        competition: { clubId },
      },
      select: {
        score: true,
        updatedAt: true,
        competition: { select: { discipline: true } },
      },
    });

    const practiceRows = await prisma.practiceScore.findMany({
      where: {
        clubId,
        userId: req.user!.id,
      },
      select: {
        score: true,
        recordedAt: true,
        discipline: true,
      },
    });

    const competitionSamples = competitionRows.map(row => ({
      score: row.score as number,
      scoredAt: row.updatedAt,
      discipline: normalizeDiscipline(row.competition.discipline),
    }));
    const practiceSamples = practiceRows.map(row => ({
      score: row.score,
      scoredAt: row.recordedAt,
      discipline: normalizeDiscipline(row.discipline),
    }));
    const allSamples = [...competitionSamples, ...practiceSamples];

    const overall = scoreStats(allSamples);
    const competitionStats = scoreStats(competitionSamples);
    const practiceStats = scoreStats(practiceSamples);

    const selectedMetric = settings.membershipCardAverageMetric ?? MembershipCardAverageMetric.OVERALL_LAST_10;
    const selectedDiscipline = settings.membershipCardAverageDiscipline ? normalizeDiscipline(settings.membershipCardAverageDiscipline) : null;
    const disciplineSamples = selectedDiscipline
      ? allSamples.filter(sample => sample.discipline.toLowerCase() === selectedDiscipline.toLowerCase())
      : [];
    const disciplineStats = scoreStats(disciplineSamples);

    let averageValue: number | null;
    switch (selectedMetric) {
      case MembershipCardAverageMetric.OVERALL_ALL_TIME:
        averageValue = overall.allTime;
        break;
      case MembershipCardAverageMetric.OVERALL_LAST_10:
        averageValue = overall.last10;
        break;
      case MembershipCardAverageMetric.COMPETITION_ALL_TIME:
        averageValue = competitionStats.allTime;
        break;
      case MembershipCardAverageMetric.COMPETITION_LAST_10:
        averageValue = competitionStats.last10;
        break;
      case MembershipCardAverageMetric.PRACTICE_ALL_TIME:
        averageValue = practiceStats.allTime;
        break;
      case MembershipCardAverageMetric.PRACTICE_LAST_10:
        averageValue = practiceStats.last10;
        break;
      case MembershipCardAverageMetric.DISCIPLINE_ALL_TIME:
        averageValue = disciplineStats.allTime;
        break;
      case MembershipCardAverageMetric.DISCIPLINE_LAST_10:
        averageValue = disciplineStats.last10;
        break;
      default:
        averageValue = overall.last10;
        break;
    }



    const passResult = await googleWalletService.issueMembershipPass({
      userId: req.user!.id,
      clubId,
      memberName: currentUser.name,
      membershipType: membership.club.name,
      visitCount,
      roundsThisYear: roundsThisYear._sum.quantity || 0,
      average: averageValue ?? 0,
      averageLabel: metricLabel(selectedMetric, selectedDiscipline),
      clubName: membership.club.name,
      settings: {
        secondaryColor: settings.secondaryColor || '#374151',
        accentColor: settings.accentColor || '#3b82f6',
        logoUrl: settings.logoUrl || undefined,
      },
    } as CreatePassParams);
    
    res.json(passResult);
    
  } catch (error) {
    console.error('Error generating membership pass:', error);
    res.status(500).json({ error: 'Failed to generate membership pass' });
  }
}

router.get('/me/membership-passes/:clubId/status', requireAuth, handleMembershipPassStatusRequest);
router.get('/me/membership-passes/:clubId', requireAuth, handleMembershipPassGenerateRequest);
router.post('/me/membership-passes/:clubId', requireAuth, handleMembershipPassGenerateRequest);

export default router;
