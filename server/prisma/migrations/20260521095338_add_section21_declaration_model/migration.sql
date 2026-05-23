-- CreateEnum
CREATE TYPE "Section21DeclarationStatus" AS ENUM ('SIGNED', 'EXPIRED', 'PENDING_RENEWAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "section21DeclarationSignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Section21Declaration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "Section21DeclarationStatus" NOT NULL,
    "allCheckboxesSigned" BOOLEAN NOT NULL,
    "fullLegalName" TEXT NOT NULL,
    "signedDate" TIMESTAMP(3) NOT NULL,
    "signedTimestamp" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section21Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section21Declaration_userId_status_idx" ON "Section21Declaration"("userId", "status");

-- CreateIndex
CREATE INDEX "Section21Declaration_userId_signedDate_idx" ON "Section21Declaration"("userId", "signedDate");

-- AddForeignKey
ALTER TABLE "Section21Declaration" ADD CONSTRAINT "Section21Declaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
