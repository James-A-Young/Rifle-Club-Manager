-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ONLINE', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "CashBoxTransactionReason" AS ENUM ('AMMUNITION_SALE', 'ADD_FLOAT', 'DONATION', 'FEE_PAYMENT', 'BANKED_CASH');

-- DropIndex
DROP INDEX "UserProfileHistory_userId_changedAt_idx";

-- AlterTable
ALTER TABLE "AmmunitionSale" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "AmmunitionType" ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "reorderLevelQuantity" INTEGER,
ADD COLUMN     "reorderQuantity" INTEGER,
ADD COLUMN     "safetyStockDays" INTEGER;

-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN     "ammoDefaultLeadTimeDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "ammoDefaultSafetyStockDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "ammoSalesLookbackDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "CashBox" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "balancePence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashBoxTransaction" (
    "id" TEXT NOT NULL,
    "cashBoxId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "reason" "CashBoxTransactionReason" NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "balanceAfterPence" INTEGER NOT NULL,
    "relatedSaleId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashBoxTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashBox_clubId_key" ON "CashBox"("clubId");

-- CreateIndex
CREATE INDEX "CashBox_updatedAt_idx" ON "CashBox"("updatedAt");

-- CreateIndex
CREATE INDEX "CashBoxTransaction_cashBoxId_createdAt_idx" ON "CashBoxTransaction"("cashBoxId", "createdAt");

-- CreateIndex
CREATE INDEX "CashBoxTransaction_clubId_createdAt_idx" ON "CashBoxTransaction"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashBoxTransaction_relatedSaleId_key" ON "CashBoxTransaction"("relatedSaleId");

-- CreateIndex
CREATE INDEX "UserProfileHistory_userId_changedAt_idx" ON "UserProfileHistory"("userId", "changedAt");

-- AddForeignKey
ALTER TABLE "CashBox" ADD CONSTRAINT "CashBox_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBoxTransaction" ADD CONSTRAINT "CashBoxTransaction_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBoxTransaction" ADD CONSTRAINT "CashBoxTransaction_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBoxTransaction" ADD CONSTRAINT "CashBoxTransaction_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "AmmunitionSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashBoxTransaction" ADD CONSTRAINT "CashBoxTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
