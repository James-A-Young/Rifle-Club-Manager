-- AlterEnum
ALTER TYPE "BackupDataset" ADD VALUE 'GOOGLE_WALLET_PASSES';

-- CreateTable
CREATE TABLE "GoogleWalletPassMetadata" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "passObjectId" TEXT NOT NULL,
    "lastIssuedAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "lastInstalledAt" TIMESTAMP(3),
    "lastDeletedAt" TIMESTAMP(3),
    "lastDataFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleWalletPassMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleWalletWebhookEvent" (
    "id" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "passObjectId" TEXT,
    "clubId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleWalletWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleWalletPassMetadata_passObjectId_key" ON "GoogleWalletPassMetadata"("passObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleWalletPassMetadata_userId_clubId_key" ON "GoogleWalletPassMetadata"("userId", "clubId");

-- CreateIndex
CREATE INDEX "GoogleWalletPassMetadata_clubId_idx" ON "GoogleWalletPassMetadata"("clubId");

-- CreateIndex
CREATE INDEX "GoogleWalletPassMetadata_lastDeletedAt_idx" ON "GoogleWalletPassMetadata"("lastDeletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleWalletWebhookEvent_externalEventId_key" ON "GoogleWalletWebhookEvent"("externalEventId");

-- CreateIndex
CREATE INDEX "GoogleWalletWebhookEvent_passObjectId_idx" ON "GoogleWalletWebhookEvent"("passObjectId");

-- CreateIndex
CREATE INDEX "GoogleWalletWebhookEvent_receivedAt_idx" ON "GoogleWalletWebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "GoogleWalletPassMetadata" ADD CONSTRAINT "GoogleWalletPassMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleWalletPassMetadata" ADD CONSTRAINT "GoogleWalletPassMetadata_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
