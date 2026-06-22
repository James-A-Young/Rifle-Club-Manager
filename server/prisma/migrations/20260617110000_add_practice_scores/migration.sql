-- CreateTable
CREATE TABLE "PracticeScore" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeScore_clubId_userId_recordedAt_idx" ON "PracticeScore"("clubId", "userId", "recordedAt");
CREATE INDEX "PracticeScore_clubId_discipline_recordedAt_idx" ON "PracticeScore"("clubId", "discipline", "recordedAt");

-- AddForeignKey
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeScore" ADD CONSTRAINT "PracticeScore_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
