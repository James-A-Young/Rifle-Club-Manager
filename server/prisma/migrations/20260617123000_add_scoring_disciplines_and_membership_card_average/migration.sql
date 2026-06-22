-- CreateEnum
CREATE TYPE "MembershipCardAverageMetric" AS ENUM (
    'OVERALL_LAST_10',
    'OVERALL_ALL_TIME',
    'COMPETITION_LAST_10',
    'COMPETITION_ALL_TIME',
    'PRACTICE_LAST_10',
    'PRACTICE_ALL_TIME',
    'DISCIPLINE_LAST_10',
    'DISCIPLINE_ALL_TIME'
);

-- AlterTable
ALTER TABLE "Competition"
ADD COLUMN "discipline" TEXT NOT NULL DEFAULT 'General';

-- AlterTable
ALTER TABLE "ClubSettings"
ADD COLUMN "scoringDisciplines" JSONB,
ADD COLUMN "membershipCardAverageMetric" "MembershipCardAverageMetric" NOT NULL DEFAULT 'OVERALL_LAST_10',
ADD COLUMN "membershipCardAverageDiscipline" TEXT;
