-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "DisabilityStatus" AS ENUM ('NOT_DISABLED', 'DISABLED', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'PREFER_NOT_TO_SAY',
  ADD COLUMN "disabilityStatus" "DisabilityStatus" NOT NULL DEFAULT 'PREFER_NOT_TO_SAY';
