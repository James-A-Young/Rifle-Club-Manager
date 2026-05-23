import { BackupDataset, GoogleDriveConnectionStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../../prisma';
import { googleWalletService } from '../googleWallet';
import { buildMonthlyCompetitionResultsCsv } from '../exports/competitionResultsExport';
import { buildMonthlyMemberDemographicsCsv } from '../exports/memberDemographicsExport';
import { buildSalesLedgerCsvForMonth } from '../exports/salesLedgerExport';
import { buildSignInHistoryCsvForMonth } from '../exports/signInHistoryExport';
import { decryptSecret } from './crypto';
import { GoogleDriveBackupClient } from './googleDriveClient';
import {
  buildBackupFileName,
  fingerprintCsv,
  listMonthsBetweenInclusive,
  monthStartUtc,
  nextMonthStartUtc,
} from './utils';

type DatasetConfig = {
  dataset: BackupDataset;
  filePrefix: 'sign-in-history' | 'sales-ledger' | 'competition-results' | 'member-demographics';
  buildCsv: (clubId: string, monthStart: Date, monthEndExclusive: Date) => Promise<string>;
  getRange: (clubId: string) => Promise<{ min?: Date | null; max?: Date | null }>;
};

function lockKeyForClub(clubId: string): string {
  const digest = createHash('sha256').update(clubId).digest('hex').slice(0, 15);
  return BigInt(`0x${digest}`).toString();
}

async function acquireClubLock(clubId: string): Promise<boolean> {
  const key = lockKeyForClub(clubId);
  const result = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${BigInt(key)}) AS locked
  `;
  return Boolean(result[0]?.locked);
}

async function releaseClubLock(clubId: string): Promise<void> {
  const key = lockKeyForClub(clubId);
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${BigInt(key)})`;
}

const DATASETS: DatasetConfig[] = [
  {
    dataset: BackupDataset.SIGN_IN_HISTORY,
    filePrefix: 'sign-in-history',
    buildCsv: buildSignInHistoryCsvForMonth,
    getRange: async (clubId: string) => {
      const agg = await prisma.visitLog.aggregate({
        where: { clubId },
        _min: { timeIn: true },
        _max: { timeIn: true },
      });
      return { min: agg._min.timeIn, max: agg._max.timeIn };
    },
  },
  {
    dataset: BackupDataset.SALES_LEDGER,
    filePrefix: 'sales-ledger',
    buildCsv: buildSalesLedgerCsvForMonth,
    getRange: async (clubId: string) => {
      const agg = await prisma.ammunitionSale.aggregate({
        where: { clubId },
        _min: { createdAt: true },
        _max: { createdAt: true },
      });
      return { min: agg._min.createdAt, max: agg._max.createdAt };
    },
  },
  {
    dataset: BackupDataset.COMPETITION_RESULTS,
    filePrefix: 'competition-results',
    buildCsv: buildMonthlyCompetitionResultsCsv,
    getRange: async (clubId: string) => {
      const agg = await prisma.score.aggregate({
        where: { competition: { clubId } },
        _min: { updatedAt: true },
        _max: { updatedAt: true },
      });
      return { min: agg._min.updatedAt, max: agg._max.updatedAt };
    },
  },
  {
    dataset: BackupDataset.MEMBER_DEMOGRAPHICS,
    filePrefix: 'member-demographics',
    buildCsv: buildMonthlyMemberDemographicsCsv,
    getRange: async (_clubId: string) => {
      // Demographics are a snapshot dataset, so back up the current month each cycle.
      const now = new Date();
      return { min: now, max: now };
    },
  },
];

function logInfo(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

function logWarn(event: string, details: Record<string, unknown>): void {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

async function runDatasetForClub(params: {
  clubId: string;
  datasetConfig: DatasetConfig;
  drive: GoogleDriveBackupClient;
  folderId: string;
}): Promise<void> {
  const { clubId, datasetConfig, drive, folderId } = params;
  const now = new Date();
  const range = await datasetConfig.getRange(clubId);

  const minDate = range.min ?? now;
  const maxDate = range.max ?? now;
  const months = listMonthsBetweenInclusive(minDate, maxDate);

  for (const monthStart of months) {
    const monthEnd = nextMonthStartUtc(monthStart);
    const runStarted = Date.now();
    const csv = await datasetConfig.buildCsv(clubId, monthStart, monthEnd);
    const fingerprint = fingerprintCsv(csv);

    const existing = await prisma.backupJobState.findUnique({
      where: {
        clubId_dataset_monthStartUtc: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
        },
      },
    });

    if (existing?.lastSourceFingerprint === fingerprint && existing.lastSuccessAt) {
      await prisma.backupRun.create({
        data: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
          status: 'SKIPPED_UNCHANGED',
          sourceFingerprint: fingerprint,
          driveFileId: existing.driveFileId,
          durationMs: Date.now() - runStarted,
          finishedAt: new Date(),
        },
      });
      continue;
    }

    const fileName = buildBackupFileName(datasetConfig.filePrefix, monthStart);
    try {
      const driveFileId = await drive.upsertCsvFile(fileName, folderId, csv, existing?.driveFileId);
      const durationMs = Date.now() - runStarted;

      await prisma.backupJobState.upsert({
        where: {
          clubId_dataset_monthStartUtc: {
            clubId,
            dataset: datasetConfig.dataset,
            monthStartUtc: monthStart,
          },
        },
        create: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
          lastSourceFingerprint: fingerprint,
          driveFileId,
          lastSuccessAt: new Date(),
          lastRunDurationMs: durationMs,
          lastError: null,
        },
        update: {
          lastSourceFingerprint: fingerprint,
          driveFileId,
          lastSuccessAt: new Date(),
          lastRunDurationMs: durationMs,
          lastError: null,
        },
      });

      await prisma.backupRun.create({
        data: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
          status: 'SUCCESS',
          sourceFingerprint: fingerprint,
          driveFileId,
          durationMs,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backup error';
      await prisma.backupJobState.upsert({
        where: {
          clubId_dataset_monthStartUtc: {
            clubId,
            dataset: datasetConfig.dataset,
            monthStartUtc: monthStart,
          },
        },
        create: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
          lastSourceFingerprint: fingerprint,
          lastError: message,
        },
        update: {
          lastError: message,
        },
      });

      await prisma.backupRun.create({
        data: {
          clubId,
          dataset: datasetConfig.dataset,
          monthStartUtc: monthStart,
          status: 'FAILED',
          sourceFingerprint: fingerprint,
          error: message,
          durationMs: Date.now() - runStarted,
          finishedAt: new Date(),
        },
      });
      logWarn('BACKUP_DATASET_FAILED', { clubId, dataset: datasetConfig.dataset, monthStartUtc: monthStart.toISOString(), error: message });
    }
  }
}

export async function runBackupsForClub(clubId: string): Promise<void> {
  const lockAcquired = await acquireClubLock(clubId);
  if (!lockAcquired) {
    logInfo('BACKUP_CLUB_SKIPPED_LOCKED', { clubId });
    return;
  }

  try {
    const [club, settings, connection] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true } }),
      prisma.clubSettings.findUnique({ where: { clubId }, select: { backupEnabled: true } }),
      prisma.googleDriveConnection.findUnique({ where: { clubId } }),
    ]);

    if (!club || !settings?.backupEnabled || !connection || connection.status !== GoogleDriveConnectionStatus.ACTIVE) {
      logInfo('BACKUP_CLUB_SKIPPED_NOT_ENABLED', { clubId });
      return;
    }

    const refreshToken = decryptSecret(connection.encryptedRefreshToken, connection.tokenIv, connection.tokenAuthTag);
    const drive = new GoogleDriveBackupClient(refreshToken);
    const appRoot = await drive.getOrCreateFolder('Rifle Club Manager Backups');
    const folderId = connection.driveFolderId ?? await drive.getOrCreateFolder(`${club.name}-${club.id}`, appRoot);

    if (!connection.driveFolderId) {
      await prisma.googleDriveConnection.update({
        where: { clubId },
        data: { driveFolderId: folderId },
      });
    }

    for (const datasetConfig of DATASETS) {
      await runDatasetForClub({ clubId, datasetConfig, drive, folderId });
    }

    logInfo('BACKUP_CLUB_COMPLETED', { clubId });
  } finally {
    await releaseClubLock(clubId);
  }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, runner: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      await runner(next);
    }
  });
  await Promise.all(workers);
}

async function refreshMembershipPassesForClub(clubId: string): Promise<void> {
  try {
    // Find all memberships with installed passes for this club
    const membershipsWithPasses = await prisma.clubMembership.findMany({
      where: {
        clubId,
        installedPassId: { not: null },
        status: 'APPROVED',
      },
      include: {
        user: { select: { id: true } },
      },
    });

    if (membershipsWithPasses.length === 0) {
      return;
    }

    // Fetch club settings once for all memberships
    const settings = await prisma.clubSettings.findUnique({
      where: { clubId },
      select: {
        secondaryColor: true,
        logoUrl: true,
      },
    });

    const currentYear = new Date().getFullYear();

    for (const membership of membershipsWithPasses) {
      const userId = membership.user.id;
      const objectId = membership.installedPassId!;

      try {
        // Calculate updated stats for this membership
        const visitCount = await prisma.visitLog.count({
          where: {
            userId,
            clubId,
            timeIn: {
              gte: new Date(`${currentYear}-01-01`),
              lte: new Date(`${currentYear}-12-31T23:59:59Z`),
            },
          },
        });

        const roundsThisYear = await prisma.ammunitionSale.aggregate({
          where: {
            buyerUserId: userId,
            clubId,
            createdAt: {
              gte: new Date(`${currentYear}-01-01`),
              lte: new Date(`${currentYear}-12-31T23:59:59Z`),
            },
          },
          _sum: { quantity: true },
        });

        const averageScore = await prisma.score.aggregate({
          where: { userId },
          take: 10,
          orderBy: { updatedAt: 'desc' },
          _avg: { score: true },
        });

        // Refresh the pass on Google Wallet with updated stats and colors
        await googleWalletService.refreshMembershipPass(
          objectId,
          visitCount,
          roundsThisYear._sum.quantity || 0,
          averageScore._avg.score || 0,
          settings?.secondaryColor || '#374151',
          settings?.logoUrl || undefined
        );
      } catch (error) {
        logWarn('MEMBERSHIP_PASS_REFRESH_FAILED', {
          clubId,
          userId,
          objectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logInfo('MEMBERSHIP_PASSES_REFRESHED', { clubId, count: membershipsWithPasses.length });
  } catch (error) {
    logWarn('MEMBERSHIP_PASS_REFRESH_CYCLE_FAILED', {
      clubId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function runBackupCycle(): Promise<void> {
  // Refresh all membership passes
  try {
    const allClubs = await prisma.club.findMany({
      select: { id: true },
    });
    logInfo('MEMBERSHIP_PASS_REFRESH_CYCLE_STARTED', { clubs: allClubs.length });
    await runWithConcurrency(allClubs, 5, async club => {
      await refreshMembershipPassesForClub(club.id);
    });
    logInfo('MEMBERSHIP_PASS_REFRESH_CYCLE_FINISHED', { clubs: allClubs.length });
  } catch (error) {
    logWarn('MEMBERSHIP_PASS_REFRESH_CYCLE_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Run backup cycle for clubs with active backup connections
  const candidates = await prisma.googleDriveConnection.findMany({
    where: { status: GoogleDriveConnectionStatus.ACTIVE },
    select: { clubId: true },
  });
  const uniqueClubIds = [...new Set(candidates.map(c => c.clubId))];
  const concurrency = Number(process.env.BACKUP_WORKER_CONCURRENCY ?? '2');

  logInfo('BACKUP_CYCLE_STARTED', { clubs: uniqueClubIds.length, concurrency });
  await runWithConcurrency(uniqueClubIds, concurrency, async clubId => {
    try {
      await runBackupsForClub(clubId);
    } catch (error) {
      logWarn('BACKUP_CLUB_RUN_FAILED', {
        clubId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
  logInfo('BACKUP_CYCLE_FINISHED', { clubs: uniqueClubIds.length });
}

export function msUntilNextNightlyRunUtc(targetHourUtc = 2): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    targetHourUtc,
    0,
    0,
    0
  ));

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  const jitterMaxMs = Number(process.env.BACKUP_SCHEDULE_JITTER_MS ?? '300000');
  const jitterMs = Math.max(0, Math.floor(Math.random() * Math.max(1, jitterMaxMs)));
  return next.getTime() - now.getTime() + jitterMs;
}

export function currentMonthStartUtc(): Date {
  return monthStartUtc(new Date());
}

