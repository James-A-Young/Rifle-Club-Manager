import { createHash } from 'crypto';
import { prisma } from '../prisma';

const PASS_DELETE_SKIP_DAYS = Number(process.env.GOOGLE_WALLET_PASS_REISSUE_SKIP_DAYS ?? '7');

/**
 * Build a deterministic fingerprint from a member's visit count, scoring stats
 * and club settings. Returns the hex digest string.
 */
function buildDataFingerprint(values: {
  visitCount: number;
  roundCount: number;
  totalScore: number;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}): string {
  const payload = JSON.stringify(values);
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Compute YTD stats for a member in a club and compare against the stored
 * fingerprint in GoogleWalletPassMetadata.
 *
 * @returns `true` if the pass data has changed (or no metadata exists yet),
 *          `false` if the data is unchanged.
 */
export async function detectMemberPassDataChanges(
  userId: string,
  clubId: string
): Promise<boolean> {
  const janUTC = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [visitCount, scores, settings, metadata] = await Promise.all([
    prisma.visitLog.count({
      where: { userId, clubId, timeIn: { gte: janUTC } },
    }),
    prisma.score.findMany({
      where: {
        userId,
        competition: { clubId },
        score: { not: null },
      },
      select: { score: true },
    }),
    prisma.clubSettings.findUnique({
      where: { clubId },
      select: {
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
      },
    }),
    prisma.googleWalletPassMetadata.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { lastDataFingerprint: true },
    }),
  ]);

  const roundCount = scores.length;
  const totalScore = scores.reduce((sum, s) => sum + (s.score ?? 0), 0);

  const fingerprint = buildDataFingerprint({
    visitCount,
    roundCount,
    totalScore,
    primaryColor: settings?.primaryColor ?? null,
    secondaryColor: settings?.secondaryColor ?? null,
    accentColor: settings?.accentColor ?? null,
    logoUrl: settings?.logoUrl ?? null,
  });

  if (!metadata || metadata.lastDataFingerprint !== fingerprint) {
    return true;
  }

  return false;
}

/**
 * Build and return the current data fingerprint for a member without comparing.
 * Used when storing metadata after issuing a pass.
 */
export async function buildMemberDataFingerprint(
  userId: string,
  clubId: string
): Promise<string> {
  const janUTC = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [visitCount, scores, settings] = await Promise.all([
    prisma.visitLog.count({
      where: { userId, clubId, timeIn: { gte: janUTC } },
    }),
    prisma.score.findMany({
      where: {
        userId,
        competition: { clubId },
        score: { not: null },
      },
      select: { score: true },
    }),
    prisma.clubSettings.findUnique({
      where: { clubId },
      select: {
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        logoUrl: true,
      },
    }),
  ]);

  const roundCount = scores.length;
  const totalScore = scores.reduce((sum, s) => sum + (s.score ?? 0), 0);

  return buildDataFingerprint({
    visitCount,
    roundCount,
    totalScore,
    primaryColor: settings?.primaryColor ?? null,
    secondaryColor: settings?.secondaryColor ?? null,
    accentColor: settings?.accentColor ?? null,
    logoUrl: settings?.logoUrl ?? null,
  });
}

/**
 * Create or update pass metadata after issuing a pass.
 */
export async function storePassMetadata(
  userId: string,
  clubId: string,
  passObjectId: string,
  fingerprint: string
): Promise<void> {
  await prisma.googleWalletPassMetadata.upsert({
    where: { userId_clubId: { userId, clubId } },
    create: {
      userId,
      clubId,
      passObjectId,
      lastIssuedAt: new Date(),
      lastPushedAt: new Date(),
      lastDataFingerprint: fingerprint,
    },
    update: {
      passObjectId,
      lastIssuedAt: new Date(),
      lastPushedAt: new Date(),
      lastDataFingerprint: fingerprint,
    },
  });
}

/**
 * Record that a pass was installed (from a webhook resourceSave event).
 */
export async function markPassInstalled(passObjectId: string): Promise<void> {
  await prisma.googleWalletPassMetadata.updateMany({
    where: { passObjectId },
    data: { lastInstalledAt: new Date() },
  });
}

/**
 * Record that a pass was deleted (from a webhook resourceDelete event).
 * Sets lastDeletedAt so the nightly worker skips re-issuance for skipDays.
 */
export async function markPassDeleted(passObjectId: string): Promise<void> {
  await prisma.googleWalletPassMetadata.updateMany({
    where: { passObjectId },
    data: { lastDeletedAt: new Date() },
  });
}

/**
 * Returns true if the member recently deleted their pass and the nightly
 * worker should skip re-issuance for them.
 */
export async function shouldSkipDueToRecentDeletion(
  userId: string,
  clubId: string
): Promise<boolean> {
  const metadata = await prisma.googleWalletPassMetadata.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { lastDeletedAt: true },
  });

  if (!metadata?.lastDeletedAt) {
    return false;
  }

  const skipUntil = new Date(metadata.lastDeletedAt);
  skipUntil.setUTCDate(skipUntil.getUTCDate() + PASS_DELETE_SKIP_DAYS);
  return new Date() < skipUntil;
}
