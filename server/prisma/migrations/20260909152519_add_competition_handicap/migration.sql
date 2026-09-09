-- CreateEnum
CREATE TYPE "HandicapSystem" AS ENUM ('NONE', 'MCCRAE');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "handicapSystem" "HandicapSystem" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN     "handicap" DOUBLE PRECISION;
