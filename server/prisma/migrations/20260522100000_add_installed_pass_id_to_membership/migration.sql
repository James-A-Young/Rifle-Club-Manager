-- Track confirmed Google Wallet pass installation state on memberships.
ALTER TABLE "ClubMembership"
ADD COLUMN "installedPassId" TEXT;

CREATE UNIQUE INDEX "ClubMembership_installedPassId_key"
ON "ClubMembership"("installedPassId");
