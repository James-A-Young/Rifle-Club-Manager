-- Migration: add global user profile history and membership approval timestamp

ALTER TABLE "ClubMembership"
ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "ClubMembership"
SET "approvedAt" = "createdAt"
WHERE "status" = 'APPROVED'::"MembershipStatus"
  AND "approvedAt" IS NULL;

CREATE TABLE "UserProfileHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "changedByUserId" TEXT,
  "changes" JSONB NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserProfileHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserProfileHistory_userId_changedAt_idx"
ON "UserProfileHistory"("userId", "changedAt" DESC);

ALTER TABLE "UserProfileHistory"
ADD CONSTRAINT "UserProfileHistory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfileHistory"
ADD CONSTRAINT "UserProfileHistory_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
