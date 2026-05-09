-- AlterTable
ALTER TABLE "User"
ADD COLUMN "firearmCertificateNumber" TEXT,
ADD COLUMN "firearmCertificateExpiry" TIMESTAMP(3),
ADD COLUMN "shotgunCertificateNumber" TEXT,
ADD COLUMN "shotgunCertificateExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Club"
ADD COLUMN "address" TEXT,
ADD COLUMN "disciplinesOffered" JSONB,
ADD COLUMN "acceptingNewMembers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "openingTimes" TEXT,
ADD COLUMN "description" TEXT;
