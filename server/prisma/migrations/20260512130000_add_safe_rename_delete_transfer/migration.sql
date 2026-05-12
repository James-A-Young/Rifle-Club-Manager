-- AlterTable: add optional note field to AmmunitionStockInput for transfer context
ALTER TABLE "AmmunitionStockInput" ADD COLUMN "note" TEXT;
