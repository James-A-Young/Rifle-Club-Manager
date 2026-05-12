-- CreateTable
CREATE TABLE "AmmunitionType" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentPricePence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmmunitionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmunitionTypePriceHistory" (
    "id" TEXT NOT NULL,
    "ammunitionTypeId" TEXT NOT NULL,
    "pricePence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmmunitionTypePriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmunitionSafe" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmmunitionSafe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmunitionStock" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "ammunitionTypeId" TEXT NOT NULL,
    "ammunitionSafeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmmunitionStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmunitionSale" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "buyerFirstName" TEXT NOT NULL,
    "buyerLastName" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "soldByUserId" TEXT NOT NULL,
    "ammunitionTypeId" TEXT NOT NULL,
    "ammunitionSafeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePence" INTEGER NOT NULL,
    "totalPricePence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmmunitionSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmunitionStockInput" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "ammunitionTypeId" TEXT NOT NULL,
    "ammunitionSafeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "inputByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmmunitionStockInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmmunitionType_clubId_name_key" ON "AmmunitionType"("clubId", "name");

-- CreateIndex
CREATE INDEX "AmmunitionType_clubId_createdAt_idx" ON "AmmunitionType"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "AmmunitionTypePriceHistory_ammunitionTypeId_createdAt_idx" ON "AmmunitionTypePriceHistory"("ammunitionTypeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AmmunitionSafe_clubId_name_key" ON "AmmunitionSafe"("clubId", "name");

-- CreateIndex
CREATE INDEX "AmmunitionSafe_clubId_createdAt_idx" ON "AmmunitionSafe"("clubId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AmmunitionStock_ammunitionTypeId_ammunitionSafeId_key" ON "AmmunitionStock"("ammunitionTypeId", "ammunitionSafeId");

-- CreateIndex
CREATE INDEX "AmmunitionStock_clubId_idx" ON "AmmunitionStock"("clubId");

-- CreateIndex
CREATE INDEX "AmmunitionSale_clubId_createdAt_idx" ON "AmmunitionSale"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "AmmunitionSale_clubId_buyerUserId_createdAt_idx" ON "AmmunitionSale"("clubId", "buyerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AmmunitionSale_clubId_soldByUserId_createdAt_idx" ON "AmmunitionSale"("clubId", "soldByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AmmunitionStockInput_clubId_createdAt_idx" ON "AmmunitionStockInput"("clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "AmmunitionType" ADD CONSTRAINT "AmmunitionType_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionTypePriceHistory" ADD CONSTRAINT "AmmunitionTypePriceHistory_ammunitionTypeId_fkey" FOREIGN KEY ("ammunitionTypeId") REFERENCES "AmmunitionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSafe" ADD CONSTRAINT "AmmunitionSafe_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStock" ADD CONSTRAINT "AmmunitionStock_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStock" ADD CONSTRAINT "AmmunitionStock_ammunitionTypeId_fkey" FOREIGN KEY ("ammunitionTypeId") REFERENCES "AmmunitionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStock" ADD CONSTRAINT "AmmunitionStock_ammunitionSafeId_fkey" FOREIGN KEY ("ammunitionSafeId") REFERENCES "AmmunitionSafe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSale" ADD CONSTRAINT "AmmunitionSale_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSale" ADD CONSTRAINT "AmmunitionSale_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSale" ADD CONSTRAINT "AmmunitionSale_soldByUserId_fkey" FOREIGN KEY ("soldByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSale" ADD CONSTRAINT "AmmunitionSale_ammunitionTypeId_fkey" FOREIGN KEY ("ammunitionTypeId") REFERENCES "AmmunitionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionSale" ADD CONSTRAINT "AmmunitionSale_ammunitionSafeId_fkey" FOREIGN KEY ("ammunitionSafeId") REFERENCES "AmmunitionSafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStockInput" ADD CONSTRAINT "AmmunitionStockInput_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStockInput" ADD CONSTRAINT "AmmunitionStockInput_ammunitionTypeId_fkey" FOREIGN KEY ("ammunitionTypeId") REFERENCES "AmmunitionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStockInput" ADD CONSTRAINT "AmmunitionStockInput_ammunitionSafeId_fkey" FOREIGN KEY ("ammunitionSafeId") REFERENCES "AmmunitionSafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmunitionStockInput" ADD CONSTRAINT "AmmunitionStockInput_inputByUserId_fkey" FOREIGN KEY ("inputByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
