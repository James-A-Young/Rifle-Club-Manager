-- Add member/firearm snapshot columns for immutable visit history and search continuity
ALTER TABLE "VisitLog"
  ADD COLUMN "memberUserIdSnapshot" TEXT,
  ADD COLUMN "memberNameSnapshot" TEXT,
  ADD COLUMN "memberEmailSnapshot" TEXT,
  ADD COLUMN "firearmSerialSnapshot" TEXT,
  ADD COLUMN "firearmMakeSnapshot" TEXT,
  ADD COLUMN "firearmModelSnapshot" TEXT,
  ADD COLUMN "firearmCaliberSnapshot" TEXT;

-- Add soft-delete marker to keep firearm records joinable for historical visits
ALTER TABLE "Firearm"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Firearm_deletedAt_idx" ON "Firearm"("deletedAt");
CREATE INDEX "VisitLog_clubId_memberUserIdSnapshot_timeIn_idx" ON "VisitLog"("clubId", "memberUserIdSnapshot", "timeIn");
CREATE INDEX "VisitLog_clubId_memberNameSnapshot_idx" ON "VisitLog"("clubId", "memberNameSnapshot");
CREATE INDEX "VisitLog_clubId_memberEmailSnapshot_idx" ON "VisitLog"("clubId", "memberEmailSnapshot");
CREATE INDEX "VisitLog_clubId_firearmSerialSnapshot_idx" ON "VisitLog"("clubId", "firearmSerialSnapshot");

-- Backfill snapshots for existing rows where related records still exist
UPDATE "VisitLog" v
SET
  "memberUserIdSnapshot" = COALESCE(v."memberUserIdSnapshot", v."userId"),
  "memberNameSnapshot" = COALESCE(v."memberNameSnapshot", u."name"),
  "memberEmailSnapshot" = COALESCE(v."memberEmailSnapshot", u."email")
FROM "User" u
WHERE v."userId" = u."id";

UPDATE "VisitLog" v
SET
  "firearmSerialSnapshot" = COALESCE(v."firearmSerialSnapshot", f."serialNumber"),
  "firearmMakeSnapshot" = COALESCE(v."firearmMakeSnapshot", f."make"),
  "firearmModelSnapshot" = COALESCE(v."firearmModelSnapshot", f."model"),
  "firearmCaliberSnapshot" = COALESCE(v."firearmCaliberSnapshot", f."caliber")
FROM "Firearm" f
WHERE v."firearmUsedId" = f."id";