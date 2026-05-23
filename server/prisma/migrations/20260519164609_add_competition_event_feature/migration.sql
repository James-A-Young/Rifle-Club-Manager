-- CreateEnum
CREATE TYPE "CompetitionFormat" AS ENUM ('LEAGUE', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('TEAM', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'EDITOR');

-- AlterTable: Score - make previously required fields optional, add new columns
ALTER TABLE "Score" ALTER COLUMN "competitionId" DROP NOT NULL;
ALTER TABLE "Score" ALTER COLUMN "roundId" DROP NOT NULL;
ALTER TABLE "Score" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Score" ADD COLUMN "matchId" TEXT;
ALTER TABLE "Score" ADD COLUMN "rawScore" INTEGER;
ALTER TABLE "Score" ADD COLUMN "unregisteredName" TEXT;
ALTER TABLE "Score" ADD COLUMN "submittedByClubId" TEXT;

-- DropIndex: was part of the unique constraint that no longer applies due to nullable fields
DROP INDEX IF EXISTS "Score_roundId_userId_cardNumber_key";

-- CreateIndex: new index for matchId on Score
CREATE INDEX "Score_matchId_idx" ON "Score"("matchId");

-- CreateTable: CompetitionEvent
CREATE TABLE "CompetitionEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "CompetitionFormat" NOT NULL,
    "type" "CompetitionType" NOT NULL,
    "owningClubId" TEXT,
    "owningUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompetitionAdmin
CREATE TABLE "CompetitionAdmin" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,

    CONSTRAINT "CompetitionAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompetitionDivision
CREATE TABLE "CompetitionDivision" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompetitionParticipant
CREATE TABLE "CompetitionParticipant" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "clubId" TEXT,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "declaredAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBogey" BOOLEAN NOT NULL DEFAULT false,
    "bogeyScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompetitionRound
CREATE TABLE "CompetitionRound" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CompetitionMatch
CREATE TABLE "CompetitionMatch" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "homeParticipantId" TEXT NOT NULL,
    "awayParticipantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionEvent_owningClubId_idx" ON "CompetitionEvent"("owningClubId");
CREATE INDEX "CompetitionEvent_owningUserId_idx" ON "CompetitionEvent"("owningUserId");
CREATE UNIQUE INDEX "CompetitionAdmin_competitionId_userId_key" ON "CompetitionAdmin"("competitionId", "userId");
CREATE INDEX "CompetitionAdmin_userId_idx" ON "CompetitionAdmin"("userId");
CREATE INDEX "CompetitionDivision_competitionId_idx" ON "CompetitionDivision"("competitionId");
CREATE INDEX "CompetitionParticipant_divisionId_idx" ON "CompetitionParticipant"("divisionId");
CREATE INDEX "CompetitionParticipant_clubId_idx" ON "CompetitionParticipant"("clubId");
CREATE INDEX "CompetitionParticipant_userId_idx" ON "CompetitionParticipant"("userId");
CREATE INDEX "CompetitionRound_competitionId_idx" ON "CompetitionRound"("competitionId");
CREATE INDEX "CompetitionMatch_roundId_idx" ON "CompetitionMatch"("roundId");
CREATE INDEX "CompetitionMatch_homeParticipantId_idx" ON "CompetitionMatch"("homeParticipantId");
CREATE INDEX "CompetitionMatch_awayParticipantId_idx" ON "CompetitionMatch"("awayParticipantId");

-- AddForeignKey: Score.matchId -> CompetitionMatch
ALTER TABLE "Score" ADD CONSTRAINT "Score_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CompetitionMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Score.submittedByClubId -> Club
ALTER TABLE "Score" ADD CONSTRAINT "Score_submittedByClubId_fkey" FOREIGN KEY ("submittedByClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompetitionEvent.owningClubId -> Club
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_owningClubId_fkey" FOREIGN KEY ("owningClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompetitionEvent.owningUserId -> User
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_owningUserId_fkey" FOREIGN KEY ("owningUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompetitionAdmin.competitionId -> CompetitionEvent
ALTER TABLE "CompetitionAdmin" ADD CONSTRAINT "CompetitionAdmin_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "CompetitionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionAdmin.userId -> User
ALTER TABLE "CompetitionAdmin" ADD CONSTRAINT "CompetitionAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionDivision.competitionId -> CompetitionEvent
ALTER TABLE "CompetitionDivision" ADD CONSTRAINT "CompetitionDivision_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "CompetitionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionParticipant.divisionId -> CompetitionDivision
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CompetitionDivision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionParticipant.clubId -> Club
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompetitionParticipant.userId -> User
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CompetitionRound.competitionId -> CompetitionEvent
ALTER TABLE "CompetitionRound" ADD CONSTRAINT "CompetitionRound_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "CompetitionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionMatch.roundId -> CompetitionRound
ALTER TABLE "CompetitionMatch" ADD CONSTRAINT "CompetitionMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompetitionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: CompetitionMatch.homeParticipantId -> CompetitionParticipant
ALTER TABLE "CompetitionMatch" ADD CONSTRAINT "CompetitionMatch_homeParticipantId_fkey" FOREIGN KEY ("homeParticipantId") REFERENCES "CompetitionParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: CompetitionMatch.awayParticipantId -> CompetitionParticipant
ALTER TABLE "CompetitionMatch" ADD CONSTRAINT "CompetitionMatch_awayParticipantId_fkey" FOREIGN KEY ("awayParticipantId") REFERENCES "CompetitionParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
