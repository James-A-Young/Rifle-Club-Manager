-- CreateEnum
CREATE TYPE "BackupDataset" AS ENUM ('SIGN_IN_HISTORY', 'SALES_LEDGER', 'COMPETITION_RESULTS');

-- CreateEnum
CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN     "backupEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "status" "GoogleDriveConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "driveFolderId" TEXT,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenAuthTag" TEXT NOT NULL,
    "tokenScope" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupJobState" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "dataset" "BackupDataset" NOT NULL,
    "monthStartUtc" TIMESTAMP(3) NOT NULL,
    "lastSourceFingerprint" TEXT NOT NULL,
    "driveFileId" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastRunDurationMs" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupJobState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "dataset" "BackupDataset" NOT NULL,
    "monthStartUtc" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "sourceFingerprint" TEXT,
    "driveFileId" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDriveOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleDriveOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveConnection_clubId_key" ON "GoogleDriveConnection"("clubId");

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_status_idx" ON "GoogleDriveConnection"("status");

-- CreateIndex
CREATE INDEX "GoogleDriveConnection_linkedAt_idx" ON "GoogleDriveConnection"("linkedAt");

-- CreateIndex
CREATE INDEX "BackupJobState_clubId_dataset_idx" ON "BackupJobState"("clubId", "dataset");

-- CreateIndex
CREATE INDEX "BackupJobState_lastSuccessAt_idx" ON "BackupJobState"("lastSuccessAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupJobState_clubId_dataset_monthStartUtc_key" ON "BackupJobState"("clubId", "dataset", "monthStartUtc");

-- CreateIndex
CREATE INDEX "BackupRun_clubId_startedAt_idx" ON "BackupRun"("clubId", "startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_dataset_monthStartUtc_idx" ON "BackupRun"("dataset", "monthStartUtc");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveOAuthState_state_key" ON "GoogleDriveOAuthState"("state");

-- CreateIndex
CREATE INDEX "GoogleDriveOAuthState_clubId_userId_idx" ON "GoogleDriveOAuthState"("clubId", "userId");

-- CreateIndex
CREATE INDEX "GoogleDriveOAuthState_expiresAt_idx" ON "GoogleDriveOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupJobState" ADD CONSTRAINT "BackupJobState_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

